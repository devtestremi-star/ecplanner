import { createTheme } from '@mui/material/styles';

/**
 * Thème sombre aux couleurs de l'addon ECP : violet d'accent, fonds indigo plutôt que
 * gris neutres — un gris pur donnait l'aspect d'un gabarit pas fini. Palette tirée du
 * fond `Media/Background/bg-1` de l'addon (violet #b39ef4 sur indigo #131043).
 *
 * Les couleurs de classe viennent de `@timeline/shared` et ne passent pas par la palette
 * MUI : ce sont celles de Blizzard, elles ne se thèment pas.
 */
export const PALETTE = {
  bg: '#14122b',
  surface: '#1d1a3a',
  sidebar: '#100e22',
  violet: '#9d8cf5',
  violetLight: '#b39ef4',
  violetDeep: '#5b4bd6',
  /** Les trois lettres du logo ECP, relevées sur `logo-1-rond.png`. */
  ecpGreen: '#02f578',
  ecpOrange: '#fc7500',
  ecpBlue: '#006cfa',
  /** Or des textes de WoW (|cffffd100) : réservé à ce qui doit sauter aux yeux. */
  gold: '#ffd100',
} as const;

export const theme = createTheme({
  palette: {
    mode: 'dark',
    background: { default: PALETTE.bg, paper: PALETTE.surface },
    primary: { main: PALETTE.violet, light: PALETTE.violetLight, dark: PALETTE.violetDeep, contrastText: '#120f29' },
    secondary: { main: PALETTE.gold },
    success: { main: '#3fb950' },
    error: { main: '#f85149' },
    divider: 'rgba(179,158,244,.14)',
    text: { primary: '#eeecfb', secondary: '#aaa5cf' },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
    h1: { fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 },
    h2: { fontSize: '1.2rem', fontWeight: 600, letterSpacing: '-0.01em' },
    h3: { fontSize: '1rem', fontWeight: 600 },
    body1: { lineHeight: 1.65 },
    body2: { lineHeight: 1.6 },
    overline: { fontWeight: 600, letterSpacing: '0.12em', lineHeight: 1.6 },
  },
  components: {
    MuiPaper: {
      styleOverrides: { root: { backgroundImage: 'none' } },
      variants: [{ props: { variant: 'outlined' }, style: { borderColor: 'rgba(179,158,244,.14)' } }],
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { textTransform: 'none', fontWeight: 600, borderRadius: 8 } },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 600 } } },
    MuiTab: { styleOverrides: { root: { textTransform: 'none', fontWeight: 600 } } },
    MuiTooltip: { defaultProps: { arrow: true } },
  },
});

/** Largeur de la sidebar, dépliée et repliée. Partagée avec la mise en page. */
export const SIDEBAR_W = 248;
export const SIDEBAR_W_COLLAPSED = 76;
