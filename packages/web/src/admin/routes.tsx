import { Navigate, type RouteObject } from 'react-router-dom';
import { AdminHome } from './AdminHome.js';
import { AdminLayout } from './AdminLayout.js';
import { BossesPage } from './pages/BossesPage.js';
import { DungeonsPage } from './pages/DungeonsPage.js';
import { RunsPage } from './pages/RunsPage.js';
import { ScanJobsPage } from './pages/ScanJobsPage.js';
import { ScannedBossesPage } from './pages/ScannedBossesPage.js';
import { SeasonsPage } from './pages/SeasonsPage.js';
import { SpellsPage } from './pages/SpellsPage.js';

/**
 * Une route par table NON pivot. Les deux pivots (`dungeon_season`, `spell_spec`)
 * n'en ont pas : ils s'éditent depuis la fiche de leur parent, seul endroit où ils
 * veulent dire quelque chose.
 *
 * Exporté en bloc pour que `main.tsx` n'ait qu'une ligne à porter.
 */
export const adminRoute: RouteObject = {
  path: '/admin',
  element: <AdminLayout />,
  children: [
    { index: true, element: <AdminHome /> },
    { path: 'seasons', element: <SeasonsPage /> },
    { path: 'dungeons', element: <DungeonsPage /> },
    { path: 'bosses', element: <BossesPage /> },
    { path: 'spells', element: <SpellsPage /> },
    { path: 'runs', element: <RunsPage /> },
    { path: 'scanned-bosses', element: <ScannedBossesPage /> },
    { path: 'scan-jobs', element: <ScanJobsPage /> },
    { path: '*', element: <Navigate to="/admin" replace /> },
  ],
};
