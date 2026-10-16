import { useEffect, useState } from 'react';
import { api } from './api.js';
import type { FieldDef, Option, Refs, Row } from './types.js';

/** Les valeurs de formulaire restent des strings : la coercition est faite par le serveur. */
export type FormValue = string | boolean | null;
export type FormState = Record<string, FormValue>;

/** ISO ⇄ `datetime-local`, qui n'accepte ni fuseau ni millisecondes. */
const toLocalInput = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Valeur d'entité → valeur de formulaire. */
export function toFormValue(field: FieldDef, raw: unknown): FormValue {
  if (raw === null || raw === undefined) return field.kind === 'boolean' ? false : '';
  switch (field.kind) {
    case 'boolean': return raw === true;
    case 'date': return toLocalInput(String(raw));
    case 'json': return JSON.stringify(raw, null, 2);
    case 'int-array': return Array.isArray(raw) ? raw.join(', ') : String(raw);
    default: return String(raw);
  }
}

export function initialForm(fields: FieldDef[], row: Row | null): FormState {
  const state: FormState = {};
  for (const f of fields) state[f.name] = toFormValue(f, row?.[f.name]);
  return state;
}

/** Cache des listes d'options : un formulaire ré-ouvert ne relance pas la requête. */
const optionCache = new Map<string, Promise<Option[]>>();
export function loadOptions(resource: string): Promise<Option[]> {
  let p = optionCache.get(resource);
  if (!p) {
    p = api.options(resource);
    optionCache.set(resource, p);
  }
  return p;
}
export const invalidateOptions = (resource: string): void => void optionCache.delete(resource);

function RelationInput({ field, value, onChange, disabled }: {
  field: FieldDef; value: string; onChange: (v: string) => void; disabled: boolean;
}) {
  const [options, setOptions] = useState<Option[] | null>(null);

  useEffect(() => {
    let alive = true;
    loadOptions(field.target!).then((o) => alive && setOptions(o)).catch(() => alive && setOptions([]));
    return () => { alive = false; };
  }, [field.target]);

  if (!options) return <input value={value} disabled readOnly placeholder="chargement…" />;

  // La valeur courante peut sortir des 200 premières options : on l'ajoute pour ne pas la perdre.
  const known = options.some((o) => o.value === value);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">— aucun —</option>
      {!known && value !== '' && <option value={value}>{value} (hors liste)</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

export function FieldInput({ field, value, onChange, disabled = false }: {
  field: FieldDef; value: FormValue; onChange: (v: FormValue) => void; disabled?: boolean;
}) {
  const str = typeof value === 'string' ? value : '';

  if (field.choices) {
    return (
      <select value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">—</option>
        {field.choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    );
  }

  switch (field.kind) {
    case 'boolean':
      return (
        <span className="inline">
          <input type="checkbox" checked={value === true} disabled={disabled}
                 onChange={(e) => onChange(e.target.checked)} />
          <span style={{ color: 'var(--text-dim)', fontSize: 12 }}>{value === true ? 'oui' : 'non'}</span>
        </span>
      );
    case 'integer':
      return <input type="number" step={1} value={str} disabled={disabled}
                    onChange={(e) => onChange(e.target.value)} />;
    case 'date':
      return <input type="datetime-local" value={str} disabled={disabled}
                    onChange={(e) => onChange(e.target.value)} />;
    case 'enum':
      return (
        <select value={str} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
          <option value="">— aucune —</option>
          {field.enumValues?.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      );
    case 'relation':
      return <RelationInput field={field} value={str} onChange={onChange} disabled={disabled} />;
    case 'json':
    case 'text':
      return <textarea value={str} disabled={disabled} spellCheck={false}
                       onChange={(e) => onChange(e.target.value)} />;
    case 'int-array':
      return <input value={str} disabled={disabled} placeholder="10, 9, 147"
                    onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input value={str} disabled={disabled} maxLength={field.maxLength}
                    onChange={(e) => onChange(e.target.value)} />;
  }
}

export function Field({ field, value, onChange, disabled }: {
  field: FieldDef; value: FormValue; onChange: (v: FormValue) => void; disabled: boolean;
}) {
  return (
    <div className={`field${disabled ? ' locked' : ''}`}>
      <label>
        {field.label}
        {field.required && !disabled && <span className="req">*</span>}
      </label>
      <FieldInput field={field} value={value} onChange={onChange} disabled={disabled} />
      {field.help && <span className="help">{field.help}</span>}
    </div>
  );
}

/** Rendu d'une valeur dans le tableau. */
export function Cell({ field, row, refs }: { field: FieldDef; row: Row; refs: Refs }) {
  const value = row[field.name];
  if (value === null || value === undefined) return <span className="null">—</span>;

  switch (field.kind) {
    case 'boolean':
      return <span className={`badge ${value ? 'on' : 'off'}`}>{value ? 'oui' : 'non'}</span>;
    case 'enum':
      return <span className={`badge cat-${String(value)}`}>{String(value)}</span>;
    case 'date':
      return <span className="mono">{new Date(String(value)).toLocaleString('fr-CA')}</span>;
    case 'relation': {
      const label = refs[field.name]?.[String(value)];
      return label
        ? <span title={String(value)}>{label}</span>
        : <span className="mono">{String(value)}</span>;
    }
    case 'int-array':
      return <span className="mono">{Array.isArray(value) ? value.join(', ') : String(value)}</span>;
    case 'integer':
      return <>{Number(value).toLocaleString('fr-CA')}</>;
    default: {
      const s = String(value);
      return <span title={s.length > 60 ? s : undefined}>{s.length > 60 ? `${s.slice(0, 60)}…` : s}</span>;
    }
  }
}
