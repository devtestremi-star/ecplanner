import { CssBaseline, ThemeProvider } from '@mui/material';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { adminRoute } from './admin/routes.js';
import { Scan } from './routes/Scan.js';
import { Run } from './routes/Run.js';
import { Spells } from './routes/Spells.js';
import { theme } from './theme.js';

const router = createBrowserRouter([
  { path: '/scan', element: <Scan /> },
  { path: '/spells', element: <Spells /> },
  { path: '/runs/:reportCode/:fightID', element: <Run /> },
  adminRoute,
  // Le catch-all doit rester EN DERNIER, sinon il avale /admin.
  { path: '*', element: <Navigate to="/scan" replace /> },
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
