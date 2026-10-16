import { createHash } from 'node:crypto';
import { EntityManager, MikroORM } from '@mikro-orm/postgresql';
import { Injectable, Logger } from '@nestjs/common';
import { Spell, SpellSpec } from '@timeline/db';

/** 15 jours. Au-delà, on redemande à Wowhead — un patch peut changer un tooltip. */
export const TOOLTIP_TTL_MS = 15 * 24 * 60 * 60 * 1000;

const ENDPOINT = 'https://nether.wowhead.com/tooltip/spell';
/** Anglais. La locale n'est pas modélisée en base : une seule version stockée. */
const LOCALE = 0;
/** Wowhead n'est pas une API documentée — on n'y envoie pas 30 requêtes d'un coup. */
const CONCURRENCY = 4;

/** Ce dont la timeline a besoin pour se rendre. Sans tooltip : 5 Ko gzip pour tout le catalogue. */
export interface SpellSummary {
  spellId: number;
  name: string;
  icon: string | null;
  category: string | null;
  baseCooldownSec: number | null;
  /** Sort de boss planifiable dans l'addon : ancre d'alignement et cible d'export ECP. */
  allowedInPlan: boolean;
  /** Sorts de boss seulement : `burst` ou `dot`. Sert à l'alignement. */
  damageType?: string;
  /** Sorts de joueur qui répondent aux dégâts : `HEALING`, `SHIELD` ou `DR`. Sert à l'alignement. */
  effect?: string;
  /**
   * Requalifications par spec, `{ specId: category }`. Présent seulement pour les sorts
   * qui en ont — inutile de transporter une clé vide pour 200 sorts.
   */
  bySpec?: Record<number, string>;
}

export interface SpellInfo extends SpellSummary {
  tooltipHtml: string | null;
  /** true si le tooltip vient d'être récupéré chez Wowhead plutôt que de la base. */
  fetched: boolean;
}

@Injectable()
export class WowheadService {
  private readonly log = new Logger(WowheadService.name);

  constructor(private readonly orm: MikroORM) {}

  /**
   * Catalogue léger, sans tooltip. C'est ce que la timeline consomme : icône, nom,
   * catégorie. 206 sorts pèsent 5 Ko gzip — inutile de fragmenter par run.
   */
  async getCatalog(): Promise<SpellSummary[]> {
    const em = this.orm.em.fork();
    const rows = await em.find(
      Spell,
      {},
      {
        fields: ['spellId', 'name', 'icon', 'category', 'baseCooldownSec', 'allowedInPlan', 'damageType', 'effect'],
        orderBy: { spellId: 'asc' },
      },
    );

    // Requalifications par spec. Une requête, jointure en mémoire : 5 lignes aujourd'hui,
    // et le catalogue n'est servi qu'une fois par session.
    const links = await em.find(SpellSpec, { category: { $ne: null } });
    const bySpell = new Map<number, Record<number, string>>();
    for (const l of links) {
      if (!l.category) continue;
      const spellId = l.spell.unwrap().spellId;
      const entry = bySpell.get(spellId) ?? {};
      entry[l.specId] = l.category;
      bySpell.set(spellId, entry);
    }

    return rows.map((s) => {
      const bySpec = bySpell.get(s.spellId);
      return {
        spellId: s.spellId,
        name: s.name,
        icon: s.icon ?? null,
        category: s.category ?? null,
        baseCooldownSec: s.baseCooldownSec ?? null,
        allowedInPlan: s.allowedInPlan,
        ...(s.damageType ? { damageType: s.damageType } : {}),
        ...(s.effect ? { effect: s.effect } : {}),
        ...(bySpec ? { bySpec } : {}),
      };
    });
  }

  /**
   * Empreinte du catalogue. Elle change dès qu'un sort est ajouté, retiré, renommé ou
   * recatégorisé — c'est-à-dire à chaque seed. Sert d'ETag : un `max-age` seul laissait
   * le navigateur servir un catalogue périmé après un seed, et la timeline signalait
   * alors des sorts « absents du catalogue » qui y étaient bel et bien.
   */
  async getCatalogEtag(): Promise<string> {
    /**
     * Version de la FORME du catalogue, à incrémenter à chaque champ renommé ou ajouté.
     * L'empreinte ne porte que les valeurs : quand `inTimeline` est devenu `allowedInPlan`
     * à valeurs égales, l'ETag n'a pas bougé, le navigateur a gardé l'ancien JSON, et le
     * mode ECP lisait un champ absent.
     */
    const CATALOG_FORMAT = 2;
    const spells = await this.getCatalog();
    const digest = createHash('sha1')
      /**
       * TOUT ce que le front consomme entre dans l'empreinte, `allowedInPlan` et les
       * requalifications par spec comprises. Sans elles, un seed qui bascule un drapeau
       * laisse l'ETag identique : le navigateur garde un catalogue périmé, et l'alignement
       * côté front diverge en silence de ce que le serveur considère comme une ancre.
       */
      .update(
        spells
          .map((s) =>
            [s.spellId, s.name, s.icon, s.category, s.allowedInPlan ? 1 : 0, s.damageType ?? '', s.effect ?? '', JSON.stringify(s.bySpec ?? null)].join(':'),
          )
          .join('|'),
      )
      .digest('base64url')
      .slice(0, 16);
    return `"cat-v${CATALOG_FORMAT}-${spells.length}-${digest}"`;
  }

  /** Le tooltip d'un sort. `null` si le sort est inconnu de la base. */
  async getTooltip(spellId: number): Promise<{ spellId: number; tooltipHtml: string | null } | null> {
    const [info] = await this.getSpells([spellId]);
    if (!info) return null;
    return { spellId: info.spellId, tooltipHtml: info.tooltipHtml };
  }

  /**
   * La base fait foi. Wowhead n'est interrogé que pour les entrées absentes ou périmées,
   * et le résultat y est réécrit — le cache se remplit tout seul à l'usage.
   */
  async getSpells(ids: number[]): Promise<SpellInfo[]> {
    const em: EntityManager = this.orm.em.fork();
    const spells = await em.find(Spell, { spellId: { $in: ids } });

    const now = Date.now();
    const stale = spells.filter(
      (s) => !s.tooltipHtml || !s.tooltipFetchedAt || now - s.tooltipFetchedAt.getTime() > TOOLTIP_TTL_MS,
    );

    const refreshed = new Set<number>();
    if (stale.length) {
      this.log.log(`${stale.length}/${spells.length} tooltip(s) à rafraîchir`);
      for (let i = 0; i < stale.length; i += CONCURRENCY) {
        const batch = stale.slice(i, i + CONCURRENCY);
        await Promise.all(
          batch.map(async (s) => {
            const html = await this.fetchTooltip(s.spellId);
            if (html === null) return; // échec réseau : on garde l'ancienne valeur
            s.tooltipHtml = html;
            s.tooltipFetchedAt = new Date();
            refreshed.add(s.spellId);
          }),
        );
      }
      await em.flush();
    }

    return spells.map((s) => ({
      spellId: s.spellId,
      name: s.name,
      icon: s.icon ?? null,
      category: s.category ?? null,
      baseCooldownSec: s.baseCooldownSec ?? null,
      allowedInPlan: s.allowedInPlan,
      tooltipHtml: s.tooltipHtml ?? null,
      fetched: refreshed.has(s.spellId),
    }));
  }

  /** `null` en cas d'échec : un tooltip périmé vaut mieux qu'un tooltip absent. */
  private async fetchTooltip(spellId: number): Promise<string | null> {
    try {
      const res = await fetch(`${ENDPOINT}/${spellId}?locale=${LOCALE}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        this.log.warn(`Wowhead HTTP ${res.status} sur le sort ${spellId}`);
        return null;
      }
      const json = (await res.json()) as { tooltip?: unknown };
      return typeof json.tooltip === 'string' ? json.tooltip : null;
    } catch (err) {
      this.log.warn(`Wowhead injoignable sur le sort ${spellId} : ${String(err)}`);
      return null;
    }
  }
}
