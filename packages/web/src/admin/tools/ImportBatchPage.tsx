import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRoundedIcon from '@mui/icons-material/DeleteOutlineRounded';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchEcpExport } from '../../api.js';
import { formatLocale } from '../../i18n/index.js';
import { api } from '../api.js';
import { EcpPreview } from './EcpPreview.js';
import {
  batchLabel, characterLabel, type ImportBatch, type ImportCandidate, type ImportOptions,
} from './imports.js';

const mmss = (ms: number): string => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Un lot d'import : ses clés, importées une par une à la main. L'import passe par le même
 * scan que l'accueil du site ; une run déjà en base est marquée importée d'office.
 */
export function ImportBatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const id = Number(useParams().id);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [options, setOptions] = useState<ImportOptions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [copied, setCopied] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [hideDepleted, setHideDepleted] = useState(false);
  /** Run affichée en aperçu sous le tableau (id de la ligne). */
  const [previewId, setPreviewId] = useState<number | null>(null);
  /** Donjons MASQUÉS : vide = tout afficher, et un donjon nouveau n'est jamais caché par défaut. */
  const [hiddenDungeons, setHiddenDungeons] = useState<Set<number>>(new Set());

  const load = () =>
    api.imports.get(id)
      .then((r) => {
        setBatch(r.batch);
        setCandidates(r.candidates);
        setName(r.batch.name ?? '');
      })
      .catch((e: Error) => setError(e.message));

  useEffect(() => {
    void load();
    api.imports.options().then(setOptions).catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const mark = (cid: number, on: boolean) =>
    setBusy((s) => {
      const next = new Set(s);
      if (on) next.add(cid);
      else next.delete(cid);
      return next;
    });

  const importOne = async (c: ImportCandidate) => {
    mark(c.id, true);
    try {
      const res = await api.imports.importCandidate(id, c.id);
      setCandidates((list) => list.map((x) =>
        x.id === c.id ? { ...x, imported: res.ok, lastError: res.ok ? null : res.error ?? null } : x));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      mark(c.id, false);
    }
  };

  const removeOne = async (c: ImportCandidate) => {
    if (!window.confirm(t('admin.tools.imports.confirmRemoveRun', { dungeon: c.dungeon, level: c.keystoneLevel }))) return;
    await api.imports.removeCandidate(id, c.id).catch((e: Error) => setError(e.message));
    setCandidates((list) => list.filter((x) => x.id !== c.id));
  };

  /** Même export que la page de run : donjon entier, copié depuis la variable, jamais le DOM. */
  const exportOne = async (c: ImportCandidate) => {
    try {
      const { wire } = await fetchEcpExport(c.reportCode, c.fightID);
      await navigator.clipboard.writeText(wire);
      setCopied(c.id);
      setTimeout(() => setCopied((v) => (v === c.id ? null : v)), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const save = async (body: { name?: string | null; healerSpecId?: number | null }) => {
    try {
      const r = await api.imports.update(id, body);
      setBatch(r.batch);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const removeBatch = async () => {
    if (!batch || !window.confirm(t('admin.tools.imports.confirmRemoveBatch', { name: batchLabel(batch) }))) return;
    await api.imports.remove(id).catch((e: Error) => setError(e.message));
    navigate('/admin/tools/imports');
  };

  if (!batch) {
    return error ? <div className="error">{error}</div> : <p className="null">{t('admin.loading')}</p>;
  }

  const toggleDungeon = (gameZoneId: number) =>
    setHiddenDungeons((s) => {
      const next = new Set(s);
      if (next.has(gameZoneId)) next.delete(gameZoneId);
      else next.add(gameZoneId);
      return next;
    });

  // Une puce par donjon présent dans le lot, avec son nombre de clés et d'importées.
  const byDungeon = new Map<number, { name: string; total: number; imported: number }>();
  for (const c of candidates) {
    const d = byDungeon.get(c.gameZoneId) ?? { name: c.dungeon, total: 0, imported: 0 };
    d.total += 1;
    if (c.imported) d.imported += 1;
    byDungeon.set(c.gameZoneId, d);
  }
  const dungeonChips = [...byDungeon].sort((a, b) => a[1].name.localeCompare(b[1].name));

  const shown = candidates.filter((c) =>
    !hiddenDungeons.has(c.gameZoneId) && !(hideDepleted && c.medal === 'none'));
  const imported = candidates.filter((c) => c.imported).length;

  return (
    <>
      <div className="page-head">
        <p><Link to="/admin/tools/imports">{t('admin.tools.imports.back')}</Link></p>
        <h2>{batchLabel(batch)}</h2>
        <p>
          <span className="mono">{characterLabel(batch)}</span> · {batch.season} · +{batch.minLevel} ·{' '}
          {t('admin.tools.imports.progress', { imported, total: candidates.length })}
        </p>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="toolbar">
        <div className="filter">
          <label htmlFor="b-name">{t('admin.tools.imports.customName')}</label>
          <input
            id="b-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => name !== (batch.name ?? '') && void save({ name: name.trim() || null })}
            placeholder={characterLabel(batch)}
          />
        </div>
        <div className="filter">
          <label htmlFor="b-spec">{t('admin.tools.imports.healerSpec')}</label>
          <select
            id="b-spec"
            value={batch.healerSpecId ?? ''}
            onChange={(e) => void save({ healerSpecId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">-</option>
            {options?.healerSpecs.map((s) => <option key={s.id} value={s.id}>{s.name} {s.className}</option>)}
          </select>
        </div>
        <div className="filter">
          <input id="b-depleted" type="checkbox" checked={hideDepleted} onChange={(e) => setHideDepleted(e.target.checked)} />
          <label htmlFor="b-depleted">{t('admin.tools.imports.hideDepleted')}</label>
        </div>
        <span className="spacer" />
        <button type="button" className="btn danger" onClick={() => void removeBatch()}>{t('admin.tools.imports.deleteBatch')}</button>
      </div>

      {dungeonChips.length > 1 && (
        <div className="toolbar">
          <div className="chips">
            {dungeonChips.map(([id, d]) => (
              <button
                key={id}
                type="button"
                className={`chip ${hiddenDungeons.has(id) ? '' : 'on'}`}
                onClick={() => toggleDungeon(id)}
              >
                {t('admin.tools.imports.dungeonChip', { name: d.name, imported: d.imported, total: d.total })}
              </button>
            ))}
            {hiddenDungeons.size > 0 && (
              <button type="button" className="btn sm ghost" onClick={() => setHiddenDungeons(new Set())}>
                {t('admin.tools.imports.allDungeons')}
              </button>
            )}
          </div>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty">{t('admin.tools.imports.noRun')}</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{t('admin.tools.imports.colDungeon')}</th>
                <th>{t('admin.tools.imports.colLevel')}</th>
                <th>{t('admin.tools.imports.colResult')}</th>
                <th>{t('admin.tools.imports.colSpec')}</th>
                <th>{t('admin.tools.imports.colDate')}</th>
                <th>{t('admin.tools.imports.colDuration')}</th>
                <th>{t('admin.tools.imports.colReport')}</th>
                <th>{t('admin.tools.imports.colStatus')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => {
                const running = busy.has(c.id);
                return (
                  <tr key={c.id} className={previewId === c.id ? 'selected' : undefined}>
                    <td>{c.dungeon}</td>
                    <td className="num">+{c.keystoneLevel}</td>
                    <td>
                      <span className={`badge medal-${c.medal}`}>
                        {c.medal === 'none' ? t('admin.tools.imports.depleted') : c.medal}
                      </span>
                    </td>
                    <td>{c.spec ?? <span className="null">-</span>}</td>
                    <td>{new Date(c.startedAt).toLocaleDateString(formatLocale())}</td>
                    <td className="num">{mmss(c.duration)}</td>
                    <td className="mono">
                      <a href={`https://www.warcraftlogs.com/reports/${c.reportCode}?fight=${c.fightID}`} target="_blank" rel="noopener noreferrer">
                        {c.reportCode}-{c.fightID}
                      </a>
                    </td>
                    <td>
                      {c.imported ? (
                        <Link to={`/runs/${c.reportCode}/${c.fightID}`}>{t('admin.tools.imports.imported')}</Link>
                      ) : c.lastError ? (
                        <span className="import-error" title={c.lastError}>{c.lastError}</span>
                      ) : (
                        <span className="null">{t('admin.tools.imports.pending')}</span>
                      )}
                    </td>
                    <td className="actions">
                      <span className="row-actions">
                        {!c.imported && (
                          <button type="button" className="btn sm primary" disabled={running} onClick={() => void importOne(c)}>
                            {running ? t('admin.tools.imports.importing') : t('admin.tools.imports.import')}
                          </button>
                        )}
                        {c.imported && (
                          <button
                            type="button"
                            className={`btn sm ${previewId === c.id ? 'primary' : 'ghost'}`}
                            onClick={() => setPreviewId(previewId === c.id ? null : c.id)}
                          >
                            {t('admin.tools.imports.preview')}
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn sm ghost icon"
                          disabled={!c.imported}
                          title={copied === c.id ? t('admin.tools.imports.copied') : t('admin.tools.imports.exportEcp')}
                          aria-label={t('admin.tools.imports.exportEcp')}
                          onClick={() => void exportOne(c)}
                        >
                          {copied === c.id ? '✓' : <ContentCopyRoundedIcon fontSize="inherit" />}
                        </button>
                        <button
                          type="button"
                          className="btn sm ghost icon danger-hover"
                          title={t('admin.tools.imports.removeRun')}
                          aria-label={t('admin.tools.imports.removeRun')}
                          onClick={() => void removeOne(c)}
                        >
                          <DeleteOutlineRoundedIcon fontSize="inherit" />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Aperçu : la run telle que l'export ECP la lira, sous le tableau. */}
      {(() => {
        const c = previewId !== null ? candidates.find((c) => c.id === previewId) : undefined;
        return c?.imported
          ? <EcpPreview key={c.id} reportCode={c.reportCode} fightID={c.fightID} onClose={() => setPreviewId(null)} />
          : null;
      })()}
    </>
  );
}
