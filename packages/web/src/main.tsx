// En premier : les textes doivent être prêts avant le premier rendu.
import './i18n/index.js';
import { CssBaseline, ThemeProvider } from '@mui/material';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { adminRoute } from './admin/routes.js';
import { initAnalytics } from './analytics.js';
import { AppShell } from './layout/AppShell.js';
import { Home } from './routes/Home.js';
import { Run } from './routes/Run.js';
import { Spells } from './routes/Spells.js';
import { theme } from './theme.js';

initAnalytics();

const router = createBrowserRouter([
  {
    // Site public : tout passe par la coque avec sidebar. L'admin a la sienne.
    element: <AppShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'spells', element: <Spells /> },
      { path: 'runs/:reportCode/:fightID', element: <Run /> },
    ],
  },
  // Ancienne adresse de l'accueil : les liens déjà partagés doivent continuer de marcher.
  { path: '/scan', element: <Navigate to="/" replace /> },
  // Admin en local seulement : `import.meta.env.DEV` vaut false au build, Vite élimine la
  // branche et tout le code de l'admin avec elle. En prod, /admin tombe sur le catch-all.
  ...(import.meta.env.DEV ? [adminRoute] : []),
  // Le catch-all doit rester EN DERNIER, sinon il avale /admin.
  { path: '*', element: <Navigate to="/" replace /> },
]);

const el = document.getElementById('root');
if (!el) throw new Error('#root introuvable');
createRoot(el).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
