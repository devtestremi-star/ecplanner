import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { formatLocale } from '../../i18n/index.js';
import { iconUrl } from '../../spells/catalog.js';
import { api } from '../api.js';
import {
  computeTimers, formatTime, pullKey, toText, type TimeFormat, type TimerData,
} from './timers.js';

/** Au-delà de cet écart type, le rang n'est plus un timer fiable : on le signale. */
const SD_WARN_MS = 3_000;

const mmss = (ms: number): string => formatTime(ms, 'mmss');

/**
 * Extraction des timers d'un boss : chaque capacité curée, à chaque occurrence, avec son
 * instant moyen depuis le pull sur les combats cochés. Sortie texte prête à injecter dans
 * l'addon.
 */
export function TimerExtractionPage() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const encounterID = Number(params.get('boss')) || null;

  const [bosses, setBosses] = useState<Awaited<ReturnType<typeof api.timerBosses>> | null>(null);
  const [data, setData] = useState<TimerData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [minCoverage, setMinCoverage] = useState(0.5);
  const [format, setFormat] = useState<TimeFormat>('s');
  const [planOnly, setPlanOnly] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api.timerBosses().then(setBosses).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setData(null);
    if (encounterID === null) return;
    api.timers(encounterID)
      .then((d) => {
        setData(d);
        // Par défaut : tous les combats, sauf ceux scannés avant le jeu de sorts actuel.
        setSelected(new Set(d.pulls.filter((p) => !p.outdated).map(pullKey)));
      })
      .catch((e: Error) => setError(e.message));
  }, [encounterID]);

  const rows = useMemo(() => {
    if (!data) return [];
    const pulls = data.pulls.filter((p) => selected.has(pullKey(p)));
    const all = pulls.length ? computeTimers(data, pulls, minCoverage) : [];
    return planOnly ? all.filter((r) => r.spell.allowedInPlan) : all;
  }, [data, selected, minCoverage, planOnly]);

  const text = toText(rows, format);

  const toggle = (key: string) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSelected(next);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  // Groupés par donjon dans le sélecteur.
  const byDungeon = new Map<string, NonNullable<typeof bosses>>();
  for (const b of bosses ?? []) byDungeon.set(b.dungeon, [...(byDungeon.get(b.dungeon) ?? []), b]);

  return (
    <>
      <div className="page-head">
        <h2>{t('admin.tools.timers.title')}</h2>
        <p>{t('admin.tools.timers.intro')}</p>
      </div>

      {error && <div className="error">{error}</div>}

      <div className="toolbar">
        <div className="filter">
          <label htmlFor="timer-boss">{t('admin.tools.timers.boss')}</label>
          <select
            id="timer-boss"
            value={encounterID ?? ''}
            onChange={(e) => setParams(e.target.value ? { boss: e.target.value } : {}, { replace: true })}
          >
            <option value="">{t('admin.tools.timers.pickBoss')}</option>
            {[...byDungeon].map(([dungeon, list]) => (
              <optgroup key={dungeon} label={dungeon}>
                {list.map((b) => (
                  <option key={b.encounterID} value={b.encounterID}>
                    {t('admin.tools.timers.bossOption', { name: b.name, count: b.pulls })}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        {data && (
          <>
            <div className="filter">
              <label htmlFor="timer-coverage">{t('admin.tools.timers.minCoverage')}</label>
              <select id="timer-coverage" value={minCoverage} onChange={(e) => setMinCoverage(Number(e.target.value))}>
                {[0, 0.25, 0.5, 0.75, 1].map((v) => <option key={v} value={v}>{Math.round(v * 100)}%</option>)}
              </select>
            </div>
            <div className="filter">
              <label htmlFor="timer-format">{t('admin.tools.timers.format')}</label>
              <select id="timer-format" value={format} onChange={(e) => setFormat(e.target.value as TimeFormat)}>
                <option value="s">{t('admin.tools.timers.formatSeconds')}</option>
                <option value="s1">{t('admin.tools.timers.formatSeconds1')}</option>
                <option value="mmss">m:ss</option>
              </select>
            </div>
            <div className="filter">
              <input id="timer-plan" type="checkbox" checked={planOnly} onChange={(e) => setPlanOnly(e.target.checked)} />
              <label htmlFor="timer-plan">{t('admin.tools.timers.planOnly')}</label>
            </div>
          </>
        )}
      </div>

      {encounterID !== null && !data && !error && <p className="null">{t('admin.loading')}</p>}

      {data && (
        <>
          <h3 className="tool-section">
            {t('admin.tools.timers.pulls', { selected: selected.size, total: data.pulls.length })}
          </h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>{t('admin.tools.timers.colRun')}</th>
                  <th>{t('admin.tools.timers.colDate')}</th>
                  <th>{t('admin.tools.timers.colLevel')}</th>
                  <th>{t('admin.tools.timers.colDuration')}</th>
                  <th>{t('admin.tools.timers.colCasts')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.pulls.map((p) => {
                  const key = pullKey(p);
                  return (
                    <tr key={key} onClick={() => toggle(key)} style={{ cursor: 'pointer' }}>
                      <td><input type="checkbox" checked={selected.has(key)} onChange={() => toggle(key)} onClick={(e) => e.stopPropagation()} /></td>
                      <td className="mono">
                        <Link to={`/runs/${p.reportCode}/${p.fightID}`} onClick={(e) => e.stopPropagation()}>
                          {p.reportCode}-{p.fightID}
                        </Link>
                      </td>
                      <td>{new Date(p.startedAt).toLocaleDateString(formatLocale())}</td>
                      <td className="num">+{p.keystoneLevel}</td>
                      <td className="num">{mmss(p.duration)}</td>
                      <td className="num">{p.casts.length}</td>
                      <td>
                        {p.outdated && (
                          <span className="badge" title={t('admin.tools.timers.outdatedHelp')}>{t('admin.tools.timers.outdated')}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3 className="tool-section">{t('admin.tools.timers.result', { count: rows.length })}</h3>
          {rows.length === 0 ? (
            <div className="empty">{t('admin.tools.timers.noResult')}</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('admin.tools.timers.colTime')}</th>
                    <th>{t('admin.tools.timers.colSpell')}</th>
                    <th>{t('admin.tools.timers.colSpellId')}</th>
                    <th>#</th>
                    <th>{t('admin.tools.timers.colSeen')}</th>
                    <th>{t('admin.tools.timers.colSd')}</th>
                    <th>{t('admin.tools.timers.colRange')}</th>
                    <th>{t('admin.tools.timers.colPlan')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const icon = iconUrl(r.spell.icon, 18);
                    return (
                      <tr key={`${r.spell.spellId}-${r.occurrence}`}>
                        <td className="num">{formatTime(r.meanMs, format)}</td>
                        <td>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                            {icon && <img src={icon} alt="" width={18} height={18} style={{ borderRadius: 3 }} />}
                            {r.spell.name}
                          </span>
                        </td>
                        <td className="mono">{r.spell.spellId}</td>
                        <td className="num">{r.occurrence}</td>
                        <td className="num">{r.seen}/{r.alive}</td>
                        <td className="num" style={r.sdMs > SD_WARN_MS ? { color: 'var(--adm-warn)' } : undefined}>
                          ±{(r.sdMs / 1000).toFixed(1)}s
                        </td>
                        <td className="num">{mmss(r.minMs)} - {mmss(r.maxMs)}</td>
                        <td>
                          <span className={`badge ${r.spell.allowedInPlan ? 'on' : 'off'}`}>
                            {r.spell.allowedInPlan ? t('admin.field.yes') : t('admin.field.no')}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="toolbar" style={{ marginTop: 22 }}>
                <h3 className="tool-section" style={{ margin: 0 }}>{t('admin.tools.timers.output')}</h3>
                <span className="spacer" />
                <button type="button" className="btn primary" onClick={() => void copy()}>
                  {copied ? t('admin.tools.timers.copied') : t('admin.tools.timers.copy')}
                </button>
              </div>
              <textarea readOnly value={text} rows={Math.min(rows.length + 1, 24)} />
            </>
          )}
        </>
      )}
    </>
  );
}
