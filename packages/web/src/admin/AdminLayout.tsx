import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { AdminLogin } from './AdminLogin.js';
import { api, onUnauthorized, session, type SessionStatus } from './api.js';
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

/**
 * Coque de l'admin. Rien n'est rendu avant de connaître l'état de la session : sans elle,
 * chaque page lancerait ses requêtes et afficherait des 401 en série.
 */
export function AdminLayout() {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    session.status().then(setStatus).catch((e: Error) => setError(e.message));
  };
  useEffect(refresh, []);
  // Une session qui expire en cours d'usage ramène au formulaire.
  useEffect(() => onUnauthorized(() => setStatus((s) => (s ? { ...s, authenticated: false } : s))), []);

  if (error) return <div className="admin login"><div className="login-box"><div className="error">{error}</div></div></div>;
  if (!status) return <div className="admin login" />;
  if (!status.authenticated) return <AdminLogin onSuccess={refresh} />;

  const logout = () => {
    void session.logout().finally(() => setStatus({ ...status, authenticated: false }));
  };
  return <AdminShell canLogout={status.mode === 'password'} onLogout={logout} />;
}

function AdminShell({ canLogout, onLogout }: { canLogout: boolean; onLogout: () => void }) {
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
          {canLogout && (
            <button type="button" className="btn ghost logout" onClick={onLogout}>{t('admin.nav.logout')}</button>
          )}
        </div>
      </nav>

      <main className="content"><Outlet /></main>
    </div>
  );
}
