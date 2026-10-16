import { createTheme } from '@mui/material/styles';

/**
 * Thème sombre. Les couleurs de classe viennent de `@timeline/shared` et ne passent
 * pas par la palette MUI : ce sont celles de Blizzard, elles ne se thèment pas.
 */
export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: '#14161a', paper: '#1c1f26' },
    primary: { main: '#4a9eff' },
    success: { main: '#3fb950' },
    error: { main: '#f85149' },
    divider: '#2a2f39',
  },
  shape: { borderRadius: 8 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontSize: '1.5rem', fontWeight: 600, letterSpacing: '-0.01em' },
    h2: { fontSize: '1.15rem', fontWeight: 600 },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: { defaultProps: { disableElevation: true }, styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
  },
});
