import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fetchRun, type RunDetail } from '../../api.js';
import { loadCatalog, type SpellSummary } from '../../spells/catalog.js';
import { categoryOf, type Category } from '../../timeline/categories.js';
import { Timeline } from '../../timeline/Timeline.js';

/** Ce que l'export ECP retient : les soins et les externes. */
const ECP_CATEGORIES = new Set<Category>(['EXTERNAL', 'HEALER']);

/**
 * La run réduite à ce que l'export ECP emporte, sans aucun réglage :
 *  - côté boss, les seules capacités planifiables (`allowedInPlan`) ;
 *  - côté joueurs, les soins et externes RATTACHÉS à une capacité (un cast sans ancre
 *    n'est pas exporté), placés à l'instant de leur ancre ;
 *  - les joueurs sans aucun de ces casts disparaissent.
 */
function ecpOnly(detail: RunDetail, catalog: Map<number, SpellSummary>): { detail: RunDetail; hiddenPlayers: Set<number> } {
  const specBySource = new Map(detail.participants.map((p) => [p.sourceID, p.specId]));
  const withCasts = new Set<number>();
  const bosses = detail.bosses.map((b) => ({
    ...b,
    casts: b.casts.filter((c) => {
      const spell = catalog.get(c.abilityGameID);
      if (!specBySource.has(c.sourceID)) return spell?.allowedInPlan === true;
      const keep = c.ecp_timestamp !== null && ECP_CATEGORIES.has(categoryOf(spell, specBySource.get(c.sourceID)));
      if (keep) withCasts.add(c.sourceID);
      return keep;
    }),
  }));
  const hiddenPlayers = new Set(detail.participants.map((p) => p.sourceID).filter((id) => !withCasts.has(id)));
  return { detail: { ...detail, bosses }, hiddenPlayers };
}

export function EcpPreview({ reportCode, fightID, onClose }: { reportCode: string; fightID: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [data, setData] = useState<{ detail: RunDetail; catalog: Map<number, SpellSummary> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLElement>(null);

  /**
   * Ouvert depuis une ligne du tableau, l'aperçu est souvent hors écran : on l'amène à la
   * vue. Une fois la timeline CHARGÉE seulement — avant, la page n'est pas assez haute pour
   * défiler jusqu'à lui.
   */
  const loaded = data !== null;
  useEffect(() => {
    if (loaded) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loaded]);

  useEffect(() => {
    setData(null);
    setError(null);
    Promise.all([fetchRun(reportCode, fightID), loadCatalog()])
      .then(([detail, catalog]) => setData({ detail, catalog }))
      .catch((e: Error) => setError(e.message));
  }, [reportCode, fightID]);

  const view = data ? ecpOnly(data.detail, data.catalog) : null;

  return (
    <section className="ecp-preview" ref={ref}>
      <div className="toolbar">
        <h3 className="tool-section" style={{ margin: 0 }}>
          {data
            ? t('admin.tools.imports.previewTitle', { dungeon: data.detail.run.dungeon.name, level: data.detail.run.keystoneLevel })
            : t('admin.tools.imports.preview')}
        </h3>
        <span className="mono" style={{ color: 'var(--adm-faint)' }}>{reportCode}-{fightID}</span>
        <span className="spacer" />
        <Link className="btn sm ghost" to={`/runs/${reportCode}/${fightID}?ecp=1&cat=EXTERNAL,HEALER`} target="_blank" rel="noopener noreferrer">
          {t('admin.tools.imports.openFull')}
        </Link>
        <button type="button" className="btn sm" onClick={onClose}>{t('admin.tools.imports.closePreview')}</button>
      </div>
      {error && <div className="error">{error}</div>}
      {!data && !error && <p className="null">{t('admin.loading')}</p>}
      {view && data && (
        <Timeline
          detail={view.detail}
          catalog={data.catalog}
          categories={ECP_CATEGORIES}
          hiddenPlayers={view.hiddenPlayers}
          aligned
        />
      )}
    </section>
  );
}
