import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import { FieldInput, type FormValue } from './fields.js';
import type { FieldDef, ListResult, Row } from './types.js';
import { useSchema } from './useSchema.js';

export interface PivotPanelProps {
  /** Clé de la table de jointure, ex. `spell-specs`. */
  resource: string;
  /** Champ de la jointure qui pointe vers la ligne courante, ex. `spell`. */
  parentField: string;
  /** Id encodé de la ligne courante. */
  parentId: string;
  legend: string;
  empty?: string;
}

/**
 * Éditeur des tables pivot, monté DANS la fiche du parent.
 *
 * Les pivots n'ont pas de route à eux : `spell_spec` sans son sort, ou `dungeon_season`
 * sans son donjon, ne veut rien dire. On les édite là où ils ont un sens.
 */
export function PivotPanel({ resource, parentField, parentId, legend, empty }: PivotPanelProps) {
  const schema = useSchema(resource);
  const [data, setData] = useState<ListResult | null>(null);
  const [draft, setDraft] = useState<Record<string, FormValue>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Les autres colonnes : celles que l'utilisateur doit saisir, le parent étant déjà connu.
  const ownFields: FieldDef[] = (schema?.fields ?? []).filter((f) => f.name !== parentField && !f.readonly);

  const reload = useCallback(() => {
    api.list(resource, { [parentField]: parentId, perPage: 200 })
      .then(setData)
      .catch((e: Error) => setError(e.message));
  }, [resource, parentField, parentId]);

  useEffect(() => { reload(); }, [reload]);

  async function add() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { [parentField]: parentId };
      for (const f of ownFields) body[f.name] = draft[f.name] === '' ? null : draft[f.name] ?? null;
      await api.create(resource, body);
      setDraft({});
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function drop(row: Row) {
    setBusy(true);
    setError(null);
    try {
      await api.remove(resource, row.__id);
      reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset className="pivot">
      <legend>{legend}{data ? ` · ${data.total}` : ''}</legend>
      {error && <div className="error">{error}</div>}

      {data?.rows.length === 0 && <p className="null" style={{ margin: '4px 0' }}>{empty ?? 'Aucune ligne.'}</p>}

      {data?.rows.map((row) => (
        <div className="pivot-row" key={row.__id}>
          <span className="grow">{row.__label}</span>
          {ownFields
            .filter((f) => !f.pk && f.kind !== 'relation')
            .map((f) => <span key={f.name} className="mono">{String(row[f.name] ?? '')}</span>)}
          <button className="btn sm danger" disabled={busy} onClick={() => drop(row)}>retirer</button>
        </div>
      ))}

      <div className="pivot-add">
        {ownFields.map((f) => (
          <FieldInput key={f.name} field={f} value={draft[f.name] ?? ''}
                      onChange={(v) => setDraft((d) => ({ ...d, [f.name]: v }))} />
        ))}
        <button className="btn sm primary" disabled={busy} onClick={add}>Ajouter</button>
      </div>
    </fieldset>
  );
}
