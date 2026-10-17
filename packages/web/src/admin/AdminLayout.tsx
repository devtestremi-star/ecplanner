import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from './api.js';
import type { Stat } from './types.js';
import './admin.css';

/** Les 7 tables non pivot, dans l'ordre où on les lit : référentiel, puis scan ; puis les outils. */
export const NAV = [
  {
    group: 'admin.nav.groupReference',
    items: [
      { to: '/admin/seasons', key: 'seasons', label: 'admin.nav.seasons' },
      { to: '/admin/dungeons', key: 'dungeons', label: 'admin.nav.dungeons' },
      { to: '/admin/bosses', key: 'bosses', label: 'admin.nav.bosses' },
      { to: '/admin/spells', key: 'spells', label: 'admin.nav.spells' },
    ],
  },
  {
    group: 'admin.nav.groupScan',
    items: [
      { to: '/admin/runs', key: 'runs', label: 'admin.nav.runs' },
      { to: '/admin/scanned-bosses', key: 'scanned-bosses', label: 'admin.nav.scannedBosses' },
      { to: '/admin/scan-jobs', key: 'scan-jobs', label: 'admin.nav.scanJobs' },
    ],
  },
  {
    group: 'admin.nav.groupTools',
    items: [
      { to: '/admin/tools/timers', key: 'tools-timers', label: 'admin.nav.timerExtraction' },
    ],
  },
] as const;

export function AdminLayout() {
  const { t } = useTranslation();
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    api.stats()
      .then((s: Stat[]) => setCounts(Object.fromEntries(s.map((x) => [x.key, x.count]))))
      .catch(() => undefined);
  }, []);

  return (
    <div className="admin">
      <nav className="sidebar">
        <h1>{t('app.name')}</h1>
        <p className="sub">{t('admin.subtitle')}</p>

        <div className="nav">
          <NavLink to="/admin" end>{t('admin.nav.dashboard')}</NavLink>
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="nav-group">{t(section.group)}</div>
              {section.items.map((item) => (
                <NavLink key={item.key} to={item.to}>
                  <span>{t(item.label)}</span>
                  <span className="count">{counts[item.key] ?? ''}</span>
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-group">{t('admin.nav.groupSite')}</div>
          <NavLink to="/">{t('admin.nav.backToSite')}</NavLink>
        </div>
      </nav>

      <main className="content"><Outlet /></main>
    </div>
  );
}
