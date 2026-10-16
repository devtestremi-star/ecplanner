import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { api } from './api.js';
import { Cell, Field, FieldInput, initialForm, invalidateOptions, loadOptions, type FormState } from './fields.js';
import type { FieldDef, ListResult, Option, ResourceSchema, Row } from './types.js';
import { useSchema } from './useSchema.js';

export interface CrudPageProps {
  resource: string;
  title?: string;
  /** Colonnes affichées ; par défaut celles marquées `listed` dans le registre. */
  columns?: string[];
  /** Champs exposés en filtre ; par défaut tous les `filterable`. */
  filters?: string[];
  /** Bloc supplémentaire dans le tiroir d'édition (panneaux de pivot, liens). */
  extra?: (row: Row) => ReactNode;
  /** Cette table se remplit par le scan, pas à la main. */
  readOnlyCreate?: boolean;
}

const numeric = (f: FieldDef): boolean => f.kind === 'integer';

// ─────────────────────────────────── filtres ──────────────────────────────────

function FilterControl({ field, value, onChange }: {
  field: FieldDef; value: string; onChange: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [options, setOptions] = useState<Option[]>([]);

  useEffect(() => {
    if (field.kind !== 'relation') return;
    let alive = true;
    loadOptions(field.target!).then((o) => alive && setOptions(o)).catch(() => undefined);
    return () => { alive = false; };
  }, [field.kind, field.target]);

  const select = (opts: ReactNode) => (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t('admin.filter.all')}</option>
      {opts}
    </select>
  );

  if (field.kind === 'boolean') return select(<><option value="true">{t('admin.filter.yes')}</option><option value="false">{t('admin.filter.no')}</option></>);
  if (field.kind === 'enum') {
    return select(<>
      {field.enumValues?.map((v) => <option key={v} value={v}>{v}</option>)}
      <option value="__null">{t('admin.filter.unset')}</option>
    </>);
  }
  if (field.choices) {
    return select(field.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>));
  }
  if (field.kind === 'relation') {
    return select(<>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      <option value="__null">{t('admin.filter.unset')}</option>
    </>);
  }
  return (
    <input value={value} placeholder="-" style={{ width: 110 }}
           onChange={(e) => onChange(e.target.value)} />
  );
}

// ──────────────────────────────────── tiroir ──────────────────────────────────

function EditDrawer({ schema, id, onClose, onSaved, extra }: {
  schema: ResourceSchema;
  /** `null` ⇒ création. */
  id: string | null;
  onClose: () => void;
  onSaved: () => void;
  extra?: (row: Row) => ReactNode;
}) {
  const { t } = useTranslation();
  const creating = id === null;
  const [form, setForm] = useState<FormState | null>(creating ? initialForm(schema.fields, null) : null);
  const [row, setRow] = useState<Row | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (creating) return;
    let alive = true;
    // Le listing omet les champs lourds : l'édition les recharge en entier.
    api.get(schema.key, id).then((r) => {
      if (!alive) return;
      setRow(r.row);
      setForm(initialForm(schema.fields, r.row));
    }).catch((e: Error) => alive && setError(e.message));
    return () => { alive = false; };
  }, [creating, id, schema]);

  const set = (name: string, value: FormState[string]) =>
    setForm((f) => (f ? { ...f, [name]: value } : f));

  async function save() {
    if (!form) return;
    setSaving(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      for (const f of schema.fields) {
        if (f.readonly || (f.generated && creating)) continue;
        if (!creating && f.pk) continue; // muter une PK reviendrait à créer une autre ligne
        body[f.name] = form[f.name] === '' ? null : form[f.name];
      }
      if (creating) await api.create(schema.key, body);
      else await api.update(schema.key, id, body);
      invalidateOptions(schema.key);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!id || !window.confirm(t('admin.confirmDelete', { label: schema.label.toLowerCase(), name: row?.__label ?? id }))) return;
    setSaving(true);
    setError(null);
    try {
      await api.remove(schema.key, id);
      invalidateOptions(schema.key);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="drawer">
        <header className="drawer-head">
          <h3>{creating ? t('admin.drawerNew', { label: schema.label }) : `${schema.label} · ${row?.__label ?? '…'}`}</h3>
          <button className="btn ghost" onClick={onClose} aria-label={t('admin.close')}>✕</button>
        </header>

        <div className="drawer-body">
          {error && <div className="error">{error}</div>}
          {!form && <p className="null">{t('admin.loading')}</p>}

          {form && schema.fields.map((f) => {
            if (f.generated && creating) return null;
            const locked = f.readonly === true || (!creating && f.pk === true);
            return (
              <Field key={f.name} field={f} value={form[f.name] ?? ''} disabled={locked}
                     onChange={(v) => set(f.name, v)} />
            );
          })}

          {!creating && row && extra?.(row)}
        </div>

        <footer className="drawer-foot">
          <button className="btn primary" onClick={save} disabled={saving || !form}>
            {saving ? '…' : creating ? t('admin.create') : t('admin.save')}
          </button>
          <button className="btn" onClick={onClose}>{t('admin.cancel')}</button>
          <span className="spacer" />
          {!creating && <button className="btn danger" onClick={remove} disabled={saving}>{t('admin.delete')}</button>}
        </footer>
      </aside>
    </div>
  );
}

// ───────────────────────────────────── page ───────────────────────────────────

export function CrudPage({ resource, title, columns, filters, extra, readOnlyCreate }: CrudPageProps) {
  const { t } = useTranslation();
  const schema = useSchema(resource);
  // L'état de la liste vit dans l'URL : un filtre est partageable et le retour arrière fonctionne.
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<ListResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null | undefined>(undefined); // undefined = tiroir fermé

  const cols = useMemo<FieldDef[]>(() => {
    if (!schema) return [];
    const names = columns ?? schema.fields.filter((f) => f.listed).map((f) => f.name);
    return names.map((n) => schema.fields.find((f) => f.name === n)).filter((f): f is FieldDef => !!f);
  }, [schema, columns]);

  const filterFields = useMemo<FieldDef[]>(() => {
    if (!schema) return [];
    const names = filters ?? schema.fields.filter((f) => f.filterable).map((f) => f.name);
    return names.map((n) => schema.fields.find((f) => f.name === n)).filter((f): f is FieldDef => !!f);
  }, [schema, filters]);

  const query = useMemo(() => Object.fromEntries(params.entries()), [params]);

  const reload = useCallback(() => {
    if (!schema) return;
    setLoading(true);
    api.list(resource, query)
      .then((d) => { setData(d); setError(null); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [resource, query, schema]);

  useEffect(() => { reload(); }, [reload]);

  /** Toute modification de filtre ramène en page 1 — sinon on tombe sur une page vide. */
  const patch = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(changes)) {
      if (v === '') next.delete(k); else next.set(k, v);
    }
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  };

  const sort = params.get('sort') ?? schema?.defaultSort.field ?? '';
  const order = params.get('order') ?? schema?.defaultSort.order ?? 'asc';
  const toggleSort = (name: string) =>
    patch({ sort: name, order: sort === name && order === 'asc' ? 'desc' : 'asc' });

  if (!schema) return <p className="null">{t('admin.loadingSchema')}</p>;

  const page = data?.page ?? 1;
  const pages = data ? Math.max(1, Math.ceil(data.total / data.perPage)) : 1;
  const searchable = schema.fields.some((f) => f.searchable);

  return (
    <>
      <div className="page-head">
        <h2>{title ?? schema.labelPlural}</h2>
        {schema.description && <p>{schema.description}</p>}
      </div>

      <div className="toolbar">
        {searchable && (
          <input value={params.get('q') ?? ''} placeholder={t('admin.search')} style={{ width: 220 }}
                 onChange={(e) => patch({ q: e.target.value })} />
        )}
        {filterFields.map((f) => (
          <span className="filter" key={f.name}>
            <label>{f.label}</label>
            <FilterControl field={f} value={params.get(f.name) ?? ''} onChange={(v) => patch({ [f.name]: v })} />
          </span>
        ))}
        {params.size > 0 && (
          <button className="btn ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            {t('admin.reset')}
          </button>
        )}
        <span className="spacer" />
        {!readOnlyCreate && (
          <button className="btn primary" onClick={() => setEditing(null)}>{t('admin.new')}</button>
        )}
      </div>

      {error && <div className="error">{error}</div>}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {cols.map((f) => (
                <th key={f.name} className="sortable" onClick={() => toggleSort(f.name)}>
                  {f.label}
                  {sort === f.name && <span className="arrow">{order === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
              <th style={{ width: 1 }} />
            </tr>
          </thead>
          <tbody>
            {data?.rows.map((row) => (
              <tr key={row.__id}>
                {cols.map((f) => (
                  <td key={f.name} className={numeric(f) ? 'num' : undefined}>
                    <Cell field={f} row={row} refs={data.refs} />
                  </td>
                ))}
                <td className="actions">
                  <button className="btn sm ghost" onClick={() => setEditing(row.__id)}>{t('admin.edit')}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.rows.length === 0 && (
          <div className="empty">{loading ? t('admin.loading') : t('admin.noRows')}</div>
        )}
      </div>

      <div className="pagination">
        <button className="btn sm" disabled={page <= 1} onClick={() => patch({ page: String(page - 1) })}>‹</button>
        <span>{t('admin.page', { page, pages })}</span>
        <button className="btn sm" disabled={page >= pages} onClick={() => patch({ page: String(page + 1) })}>›</button>
        <span>{t('admin.rowCount', { count: data?.total ?? 0 })}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <span className="filter">
          <label>{t('admin.perPage')}</label>
          <select value={params.get('perPage') ?? '25'} onChange={(e) => patch({ perPage: e.target.value })}>
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>
      </div>

      {editing !== undefined && (
        <EditDrawer schema={schema} id={editing} extra={extra}
                    onClose={() => setEditing(undefined)}
                    onSaved={() => { setEditing(undefined); reload(); }} />
      )}
    </>
  );
}

export { FieldInput };
