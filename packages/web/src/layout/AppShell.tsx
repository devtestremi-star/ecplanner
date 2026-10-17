import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import {
  Box, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Stack, Tooltip, Typography,
} from '@mui/material';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { PALETTE, SIDEBAR_W, SIDEBAR_W_COLLAPSED } from '../theme.js';
import { CURSEFORGE_ORANGE, CurseForgeIcon } from './CurseForgeIcon.js';
import { DISCORD_BLURPLE, DiscordIcon } from './DiscordIcon.js';
import { DEV_MODE } from '../devMode.js';
import { DevDrawer } from './DevDrawer.js';
import { ConsentBanner } from './ConsentBanner.js';
import { Footer } from './Footer.js';
import { PageViewTracker } from './PageViewTracker.js';
import { ADDON_URL, DISCORD_URL, WAGO_URL } from './links.js';
import { WagoIcon } from './WagoIcon.js';

const NAV: ReadonlyArray<{ to: string; label: 'nav.home'; icon: ReactNode; end?: boolean }> = [
  { to: '/', label: 'nav.home', icon: <HomeRoundedIcon />, end: true },
];

/** Préférence d'affichage, propre à ce navigateur. Le stockage peut être indisponible. */
const COLLAPSED_KEY = 'timeline.sidebarCollapsed';
const readCollapsed = (): boolean => {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Coque du site public : sidebar permanente à gauche, page à droite. Pas de version
 * mobile — le site se consulte sur ordinateur.
 *
 * La sidebar se replie en rail d'icônes : la timeline a besoin de toute la largeur
 * qu'on peut lui rendre.
 */
export function AppShell() {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(readCollapsed);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // préférence non mémorisée, sans conséquence
    }
  };

  const width = collapsed ? SIDEBAR_W_COLLAPSED : SIDEBAR_W;

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Drawer
        variant="permanent"
        sx={{
          width, flexShrink: 0, transition: 'width .18s ease',
          '& .MuiDrawer-paper': {
            width,
            boxSizing: 'border-box',
            bgcolor: PALETTE.sidebar,
            borderRight: '1px solid',
            borderColor: 'divider',
            overflowX: 'hidden',
            transition: 'width .18s ease',
          },
        }}
      >
        <Stack sx={{ height: '100%', px: collapsed ? 1.5 : 2, py: 3 }}>
          <Brand compact={collapsed} />

          <List sx={{ mt: 5, display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            {NAV.map((item) => (
              <Tooltip key={item.to} title={collapsed ? t(item.label) : ''} placement="right">
                <ListItemButton
                  component={NavLink}
                  to={item.to}
                  end={item.end}
                  sx={{
                    borderRadius: '10px',
                    minHeight: 44,
                    px: 1.5,
                    justifyContent: collapsed ? 'center' : 'flex-start',
                    color: 'text.secondary',
                    '&:hover': { color: 'text.primary' },
                    '&.active': { bgcolor: 'rgba(157,140,245,.16)', color: 'primary.light' },
                  }}
                >
                  <ListItemIcon sx={{ minWidth: 0, mr: collapsed ? 0 : 1.75, color: 'inherit' }}>
                    {item.icon}
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={t(item.label)}
                      slotProps={{ primary: { sx: { fontWeight: 600, fontSize: '.92rem' } } }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            ))}
            {/* Lien sortant, mais placé avec la navigation : c'est là qu'on cherche la communauté. */}
            <StoreLink
              href={DISCORD_URL} label={t('nav.discord')} collapsed={collapsed}
              icon={<DiscordIcon />} color={DISCORD_BLURPLE} tint="88,101,242"
            />
          </List>

          <Box sx={{ flex: 1 }} />

          {/* Liens sortants, à l'écart de la navigation : ils quittent le site. */}
          {!collapsed && (
            <Typography variant="overline" sx={{ px: 1.5, color: 'text.secondary', fontSize: '.68rem' }}>
              {t('nav.getAddon')}
            </Typography>
          )}
          <Stack spacing={1.25} sx={{ mt: 1, mb: 2.5 }}>
            <StoreLink
              href={ADDON_URL} label={t('nav.curseforge')} collapsed={collapsed}
              icon={<CurseForgeIcon />} color={CURSEFORGE_ORANGE} tint="241,100,54"
            />
            <StoreLink
              href={WAGO_URL} label={t('nav.wago')} collapsed={collapsed}
              icon={<WagoIcon />} color="text.primary" tint="193,39,45"
            />
          </Stack>

          <Tooltip title={collapsed ? t('nav.expand') : t('nav.collapse')} placement="right">
            <IconButton
              onClick={toggleCollapsed}
              size="small"
              sx={{ alignSelf: collapsed ? 'center' : 'flex-end', color: 'text.secondary' }}
            >
              {collapsed ? <ChevronRightRoundedIcon /> : <ChevronLeftRoundedIcon />}
            </IconButton>
          </Tooltip>
        </Stack>
      </Drawer>

      {/* Colonne de contenu : le pied de page reste en bas même sur une page courte. */}
      <Box sx={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <Box component="main" sx={{ flex: 1 }}>
          <Outlet />
        </Box>
        <Footer />
        <PageViewTracker />
        <ConsentBanner />
      </Box>
      {DEV_MODE && <DevDrawer />}
    </Box>
  );
}

/** Lien vers une plateforme de téléchargement de l'addon, teinté à ses couleurs. */
function StoreLink({ href, label, icon, color, tint, collapsed }: {
  href: string; label: string; icon: ReactNode; color: string; tint: string; collapsed: boolean;
}) {
  return (
    <Tooltip title={collapsed ? label : ''} placement="right">
      <ListItemButton
        component="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        sx={{
          borderRadius: '10px',
          minHeight: 44,
          px: 1.5,
          flexGrow: 0,
          justifyContent: collapsed ? 'center' : 'flex-start',
          color,
          bgcolor: `rgba(${tint},.10)`,
          '&:hover': { bgcolor: `rgba(${tint},.18)` },
        }}
      >
        <ListItemIcon sx={{ minWidth: 0, mr: collapsed ? 0 : 1.75, color: 'inherit' }}>{icon}</ListItemIcon>
        {!collapsed && (
          <ListItemText primary={label} slotProps={{ primary: { sx: { fontWeight: 600, fontSize: '.92rem' } } }} />
        )}
      </ListItemButton>
    </Tooltip>
  );
}

function Brand({ compact }: { compact: boolean }) {
  const { t } = useTranslation();
  // Seul en tête de sidebar : il est le titre. Replié, il doit tenir dans le rail de 76 px.
  const size = compact ? 48 : 72;
  return (
    <Box component={NavLink} to="/" sx={{ display: 'flex', justifyContent: 'center' }}>
      {/* Logo de l'addon : le site en est le compagnon, il porte la même marque. */}
      <Box
        component="img"
        src="/logo.png"
        alt={t('app.name')}
        sx={{
          width: size, height: size, flex: 'none', display: 'block',
          borderRadius: compact ? '12px' : '16px', boxSizing: 'border-box',
          border: `2px solid ${PALETTE.violet}`,
          transition: 'width .18s ease, height .18s ease',
        }}
      />
    </Box>
  );
}
