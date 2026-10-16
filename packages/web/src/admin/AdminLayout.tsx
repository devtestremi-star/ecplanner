import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api } from './api.js';
import type { Stat } from './types.js';
import './admin.css';

/** Les 7 tables non pivot, dans l'ordre où on les lit : référentiel, puis scan. */
export const NAV: ReadonlyArray<{ group: string; items: ReadonlyArray<{ to: string; key: string; label: string }> }> = [
  {
    group: 'Référentiel',
    items: [
      { to: '/admin/seasons', key: 'seasons', label: 'Saisons' },
      { to: '/admin/dungeons', key: 'dungeons', label: 'Donjons' },
      { to: '/admin/bosses', key: 'bosses', label: 'Boss' },
      { to: '/admin/spells', key: 'spells', label: 'Sorts' },
    ],
  },
  {
    group: 'Scan',
    items: [
      { to: '/admin/runs', key: 'runs', label: 'Runs scannées' },
      { to: '/admin/scanned-bosses', key: 'scanned-bosses', label: 'Boss scannés' },
      { to: '/admin/scan-jobs', key: 'scan-jobs', label: 'Jobs de scan' },
    ],
  },
];

export function AdminLayout() {
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    api.stats()
      .then((s: Stat[]) => setCounts(Object.fromEntries(s.map((x) => [x.key, x.count]))))
      .catch(() => undefined);
  }, []);

  return (
    <div className="admin">
      <nav className="sidebar">
        <h1>Timeline M+</h1>
        <p className="sub">administration</p>

        <div className="nav">
          <NavLink to="/admin" end>Tableau de bord</NavLink>
          {NAV.map((section) => (
            <div key={section.group}>
              <div className="nav-group">{section.group}</div>
              {section.items.map((item) => (
                <NavLink key={item.key} to={item.to}>
                  <span>{item.label}</span>
                  <span className="count">{counts[item.key] ?? ''}</span>
                </NavLink>
              ))}
            </div>
          ))}
          <div className="nav-group">Site</div>
          <NavLink to="/">← retour au site</NavLink>
        </div>
      </nav>

      <main className="content"><Outlet /></main>
    </div>
  );
}
