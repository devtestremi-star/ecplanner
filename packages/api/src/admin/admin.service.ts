import { EntityManager, QueryOrder, type FilterQuery, type QueryOrderMap } from '@mikro-orm/postgresql';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ID_SEP, RESOURCES, resourceByKey, type FieldDef, type ResourceDef } from './resources.js';

export interface ListResult {
  rows: Array<Record<string, unknown>>;
  total: number;
  page: number;
  perPage: number;
  /** `{ champ: { valeurPk: libellé } }` — évite N requêtes de libellé côté front. */
  refs: Record<string, Record<string, string>>;
}

type Row = Record<string, unknown>;

@Injectable()
export class AdminService {
  constructor(private readonly em: EntityManager) {}

  resource(key: string): ResourceDef {
    const def = resourceByKey(key);
    if (!def) throw new NotFoundException(`Table « ${key} » inconnue`);
    return def;
  }

  // ─────────────────────────────── identifiants ───────────────────────────────

  /** Une PK composite voyage dans l'URL sous la forme `valeur~valeur`, dans l'ordre de `def.pk`. */
  encodeId(def: ResourceDef, entity: Row): string {
    return def.pk.map((p) => String(this.rawPkValue(def, p, entity[p]))).join(ID_SEP);
  }

  /** Rend la valeur d'une colonne de PK, en descendant dans les relations le cas échéant. */
  private rawPkValue(def: ResourceDef, prop: string, value: unknown): unknown {
    const field = def.fields.find((f) => f.name === prop);
    if (field?.kind === 'relation') return this.refId(field, value);
    return value;
  }

  /** PK d'une relation, sans charger l'entité : les colonnes de clé sont toujours résolues. */
  private refId(field: FieldDef, value: unknown): string | number | null {
    if (value === null || value === undefined) return null;
    const target = this.resource(field.target!);
    const entity = (value as { unwrap?: () => Row }).unwrap?.() ?? (value as Row);
    const parts = target.pk.map((p) => String(this.rawPkValue(target, p, entity[p])));
    if (parts.length === 1) {
      const [only] = parts;
      const n = Number(only);
      return only !== '' && Number.isFinite(n) && String(n) === only ? n : only!;
    }
    return parts.join(ID_SEP);
  }

  /**
   * Nombre de segments qu'occupe une colonne de PK dans un id encodé.
   *
   * Une PK peut porter une relation vers une entité elle-même à PK composite :
   * `scanned_boss` s'identifie par (run, orderIndex), soit `report~fight~ordre` — trois
   * segments pour deux colonnes. Compter naïvement les colonnes casse ce cas.
   */
  private arity(def: ResourceDef, prop: string): number {
    const field = def.fields.find((f) => f.name === prop);
    if (field?.kind !== 'relation') return 1;
    const target = this.resource(field.target!);
    return target.pk.reduce((n, p) => n + this.arity(target, p), 0);
  }

  private pkArity(def: ResourceDef): number {
    return def.pk.reduce((n, p) => n + this.arity(def, p), 0);
  }

  private splitId(def: ResourceDef, id: string): string[] {
    const parts = id.split(ID_SEP);
    const expected = this.pkArity(def);
    if (parts.length !== expected) {
      throw new BadRequestException(`Identifiant « ${id} » : ${expected} segment(s) attendu(s)`);
    }
    return parts;
  }

  /** Consomme les segments d'UNE colonne de PK et rend sa valeur (scalaire ou tuple). */
  private readColumn(def: ResourceDef, prop: string, parts: string[], offset: number): unknown {
    const field = def.fields.find((f) => f.name === prop)!;
    if (field.kind !== 'relation') return this.coerce(field, parts[offset]!, { forKey: true });

    const target = this.resource(field.target!);
    let cursor = offset;
    const values = target.pk.map((p) => {
      const value = this.readColumn(target, p, parts, cursor);
      cursor += this.arity(target, p);
      return value;
    });
    return values.length === 1 ? values[0] : values;
  }

  /** Décode un id d'URL en primary key MikroORM : scalaire si simple, tuple si composite. */
  private decodeId(def: ResourceDef, id: string): unknown {
    const parts = this.splitId(def, id);
    let cursor = 0;
    const values = def.pk.map((p) => {
      const value = this.readColumn(def, p, parts, cursor);
      cursor += this.arity(def, p);
      return value;
    });
    return values.length === 1 ? values[0] : values;
  }

  // ──────────────────────────────── coercition ────────────────────────────────

  /**
   * Les valeurs arrivent d'un formulaire ou d'une URL : tout est potentiellement string.
   * La conversion est pilotée par le registre, jamais devinée.
   */
  private coerce(field: FieldDef, value: unknown, opts: { forKey?: boolean } = {}): unknown {
    if (value === null || value === '' || value === undefined) {
      if (field.required && !field.generated) {
        throw new BadRequestException(`Champ « ${field.label} » requis`);
      }
      return null;
    }

    switch (field.kind) {
      case 'integer': {
        const n = Number(value);
        if (!Number.isInteger(n)) throw new BadRequestException(`« ${field.label} » : entier attendu, reçu « ${String(value)} »`);
        return n;
      }
      case 'boolean':
        return value === true || value === 'true' || value === 1 || value === '1';
      case 'date': {
        const d = value instanceof Date ? value : new Date(String(value));
        if (Number.isNaN(d.getTime())) throw new BadRequestException(`« ${field.label} » : date invalide`);
        return d;
      }
      case 'enum': {
        const v = String(value);
        if (!field.enumValues?.includes(v)) {
          throw new BadRequestException(`« ${field.label} » : valeur hors liste (${field.enumValues?.join(', ')})`);
        }
        return v;
      }
      case 'int-array': {
        const arr = Array.isArray(value) ? value : String(value).split(',').filter((s) => s.trim() !== '');
        return arr.map((v) => {
          const n = Number(v);
          if (!Number.isInteger(n)) throw new BadRequestException(`« ${field.label} » : liste d'entiers attendue`);
          return n;
        });
      }
      case 'json':
        if (typeof value !== 'string') return value;
        try { return JSON.parse(value); } catch { throw new BadRequestException(`« ${field.label} » : JSON invalide`); }
      case 'relation': {
        const target = this.resource(field.target!);
        const pk = this.decodeId(target, String(value));
        // Une PK de relation reste scalaire ; ailleurs on veut une vraie référence.
        return opts.forKey ? pk : this.em.getReference(target.entity, pk as never);
      }
      case 'string':
      case 'text':
      default:
        return String(value);
    }
  }

  // ────────────────────────────── sérialisation ───────────────────────────────

  private serialize(def: ResourceDef, entity: Row, opts: { heavy: boolean }): Row {
    const out: Row = {};
    for (const field of def.fields) {
      if (field.heavy && !opts.heavy) continue;
      const value = entity[field.name];
      out[field.name] = field.kind === 'relation' ? this.refId(field, value) : (value ?? null);
    }
    out.__id = this.encodeId(def, entity);
    out.__label = def.labelOf(out);
    return out;
  }

  /**
   * Résout les libellés des relations d'une page en une requête par champ.
   * Sans cela le tableau n'afficherait que des identifiants nus.
   */
  private async buildRefs(def: ResourceDef, rows: Row[]): Promise<Record<string, Record<string, string>>> {
    const refs: Record<string, Record<string, string>> = {};

    for (const field of def.fields) {
      if (field.kind !== 'relation') continue;
      const ids = [...new Set(rows.map((r) => r[field.name]).filter((v) => v !== null && v !== undefined))];
      if (ids.length === 0) continue;

      const target = this.resource(field.target!);
      const where = { $or: ids.map((id) => this.pkWhere(target, String(id))) } as FilterQuery<object>;
      const found = await this.em.find(target.entity, where, {
        fields: this.projection(target, { heavy: false }) as never,
      });

      const map: Record<string, string> = {};
      for (const e of found) {
        const row = this.serialize(target, e as Row, { heavy: false });
        map[String(row.__id)] = String(row.__label);
      }
      refs[field.name] = map;
    }
    return refs;
  }

  // ──────────────────────────────── requêtage ─────────────────────────────────

  /** Clause `where` ciblant une ligne par son id encodé — utilisable dans un `$or`. */
  private pkWhere(def: ResourceDef, id: string): Record<string, unknown> {
    const parts = this.splitId(def, id);
    const where: Record<string, unknown> = {};
    let cursor = 0;
    for (const p of def.pk) {
      where[p] = this.readColumn(def, p, parts, cursor);
      cursor += this.arity(def, p);
    }
    return where;
  }

  /** Les champs lourds (JSON de casts, participants) ne quittent jamais la base en listing. */
  private projection(def: ResourceDef, opts: { heavy: boolean }): string[] {
    return def.fields.filter((f) => opts.heavy || !f.heavy).map((f) => f.name);
  }

  private buildWhere(def: ResourceDef, query: Record<string, unknown>): FilterQuery<object> {
    const and: Record<string, unknown>[] = [];

    const q = typeof query.q === 'string' ? query.q.trim() : '';
    if (q) {
      const or: Record<string, unknown>[] = def.fields
        .filter((f) => f.searchable)
        .map((f) => ({ [f.name]: { $ilike: `%${q}%` } }));
      // Une recherche numérique doit aussi tomber sur les identifiants, qui ne sont pas « searchable ».
      if (/^\d+$/.test(q)) {
        for (const f of def.fields) {
          if (f.kind === 'integer') or.push({ [f.name]: Number(q) });
        }
      }
      if (or.length > 0) and.push({ $or: or });
    }

    for (const field of def.fields) {
      if (!field.filterable) continue;
      const raw = query[field.name];
      if (raw === undefined || raw === '') continue;
      if (raw === '__null') { and.push({ [field.name]: null }); continue; }
      if (field.kind === 'relation') {
        and.push({ [field.name]: this.pkWhere(this.resource(field.target!), String(raw)) });
      } else {
        and.push({ [field.name]: this.coerce(field, raw, { forKey: true }) });
      }
    }

    return (and.length > 0 ? { $and: and } : {}) as FilterQuery<object>;
  }

  // ───────────────────────────────── opérations ───────────────────────────────

  async list(key: string, query: Record<string, unknown>): Promise<ListResult> {
    const def = this.resource(key);
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const perPage = Math.min(200, Math.max(1, Number(query.perPage ?? 25) || 25));

    const sortField = typeof query.sort === 'string' && def.fields.some((f) => f.name === query.sort)
      ? query.sort
      : def.defaultSort.field;
    const order = query.order === 'asc' || query.order === 'desc' ? query.order : def.defaultSort.order;
    // NULLS LAST : trier par « CD mesuré » doit montrer les sorts mesurés, pas les trous.
    const direction = order === 'asc' ? QueryOrder.ASC_NULLS_LAST : QueryOrder.DESC_NULLS_LAST;

    const where = this.buildWhere(def, query);
    const [entities, total] = await this.em.findAndCount(def.entity, where, {
      fields: this.projection(def, { heavy: false }) as never,
      orderBy: { [sortField]: direction } as QueryOrderMap<object>,
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    const rows = entities.map((e) => this.serialize(def, e as Row, { heavy: false }));
    return { rows, total, page, perPage, refs: await this.buildRefs(def, rows) };
  }

  async get(key: string, id: string): Promise<{ row: Row; refs: Record<string, Record<string, string>> }> {
    const def = this.resource(key);
    const entity = await this.em.findOne(def.entity, this.decodeId(def, id) as never);
    if (!entity) throw new NotFoundException(`${def.label} « ${id} » introuvable`);
    const row = this.serialize(def, entity as Row, { heavy: true });
    return { row, refs: await this.buildRefs(def, [row]) };
  }

  async create(key: string, body: Row): Promise<Row> {
    const def = this.resource(key);
    const data: Row = {};
    for (const field of def.fields) {
      if (field.readonly || field.generated) continue;
      const raw = body[field.name];
      // Un champ absent du corps garde le défaut de l'entité plutôt qu'un null forcé.
      if (raw === undefined && !field.required) continue;
      data[field.name] = this.coerce(field, raw);
    }

    const entity = this.em.create(def.entity, data as never);
    await this.em.flush();
    const row = this.serialize(def, entity as Row, { heavy: true });
    return row;
  }

  async update(key: string, id: string, body: Row): Promise<Row> {
    const def = this.resource(key);
    const entity = await this.em.findOne(def.entity, this.decodeId(def, id) as never);
    if (!entity) throw new NotFoundException(`${def.label} « ${id} » introuvable`);

    for (const field of def.fields) {
      // Muter une PK reviendrait à créer une autre ligne : on refuse plutôt que de surprendre.
      if (field.pk || field.readonly) continue;
      if (!(field.name in body)) continue;
      (entity as Row)[field.name] = this.coerce(field, body[field.name]) as never;
    }

    await this.em.flush();
    return this.serialize(def, entity as Row, { heavy: true });
  }

  async remove(key: string, id: string): Promise<{ deleted: string }> {
    const def = this.resource(key);
    const entity = await this.em.findOne(def.entity, this.decodeId(def, id) as never);
    if (!entity) throw new NotFoundException(`${def.label} « ${id} » introuvable`);
    await this.em.removeAndFlush(entity);
    return { deleted: id };
  }

  /** Alimente les sélecteurs de relation des formulaires. */
  async options(key: string, q: string): Promise<Array<{ value: string; label: string }>> {
    const def = this.resource(key);
    const where = this.buildWhere(def, { q });
    const entities = await this.em.find(def.entity, where, {
      fields: this.projection(def, { heavy: false }) as never,
      orderBy: { [def.defaultSort.field]: def.defaultSort.order } as QueryOrderMap<object>,
      limit: 200,
    });
    return entities.map((e) => {
      const row = this.serialize(def, e as Row, { heavy: false });
      return { value: String(row.__id), label: String(row.__label) };
    });
  }

  /** Compte de chaque table, pour le tableau de bord. */
  async stats(): Promise<Array<{ key: string; label: string; pivot: boolean; count: number }>> {
    return Promise.all(
      RESOURCES.map(async (def) => ({
        key: def.key,
        label: def.labelPlural,
        pivot: def.pivot === true,
        count: await this.em.count(def.entity, {}),
      })),
    );
  }
}
