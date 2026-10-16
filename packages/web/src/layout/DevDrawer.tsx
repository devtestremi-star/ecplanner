import CodeRoundedIcon from '@mui/icons-material/CodeRounded';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import {
  Alert, Box, Chip, CircularProgress, Drawer, Fab, IconButton, InputAdornment, List, ListItemButton,
  Stack, TextField, Tooltip, Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { listRuns, type ScannedRunSummary } from '../api.js';
import { formatLocale } from '../i18n/index.js';

const HISTORY_SIZE = 15;
/** Délai avant de lancer la recherche : une requête par frappe serait inutile. */
const SEARCH_DEBOUNCE_MS = 300;

/**
 * Outils de dev : historique des derniers scans et recherche par identifiant dans toute
 * la base. Monté seulement en mode dev (`DEV_MODE`), par la coque du site.
 */
export function DevDrawer() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [runs, setRuns] = useState<ScannedRunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    const q = query.trim();
    // Vide : l'historique. Sinon : la recherche dans toute la base.
    const timer = setTimeout(() => {
      setError(null);
      listRuns(q ? { q, limit: 50 } : { limit: HISTORY_SIZE })
        .then((r) => alive && setRuns(r))
        .catch((e: Error) => alive && setError(e.message));
    }, q ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, query]);

  const go = (r: ScannedRunSummary) => {
    setOpen(false);
    navigate(`/runs/${r.reportCode}/${r.fightID}`);
  };

  return (
    <>
      <Tooltip title={t('dev.open')} placement="left">
        <Fab
          size="medium"
          onClick={() => setOpen(true)}
          sx={{
            // Au-dessus du pied de page : à 24 px, il recouvrait le bouton Discord.
            position: 'fixed', right: 24, bottom: 96, zIndex: 1200,
            bgcolor: '#f0b429', color: '#14122b', '&:hover': { bgcolor: '#f7c948' },
          }}
        >
          <CodeRoundedIcon />
        </Fab>
      </Tooltip>

      <Drawer anchor="right" open={open} onClose={() => setOpen(false)}>
        <Box sx={{ width: 440, p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
              <Typography variant="h2">{t('dev.title')}</Typography>
              <Chip label="APP_MODE=DEV" size="small" sx={{ bgcolor: '#f0b429', color: '#14122b' }} />
            </Stack>
            <IconButton onClick={() => setOpen(false)} aria-label={t('dev.close')}>
              <CloseRoundedIcon />
            </IconButton>
          </Stack>

          <TextField
            sx={{ mt: 3 }}
            size="small"
            fullWidth
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('dev.searchPlaceholder')}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start"><SearchRoundedIcon sx={{ color: 'text.secondary' }} /></InputAdornment>
                ),
                sx: { fontFamily: 'ui-monospace, monospace', fontSize: '.85rem' },
              },
            }}
          />

          <Typography variant="overline" sx={{ mt: 3, color: 'text.secondary' }}>
            {query.trim() ? t('dev.results', { count: runs?.length ?? 0 }) : t('dev.history', { count: HISTORY_SIZE })}
          </Typography>

          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          {!runs && !error && <CircularProgress size={20} sx={{ mt: 2 }} />}
          {runs?.length === 0 && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>{t('dev.noResult')}</Typography>
          )}

          <List sx={{ mt: .5, overflowY: 'auto', flex: 1 }}>
            {runs?.map((r) => (
              <ListItemButton
                key={`${r.reportCode}-${r.fightID}`}
                onClick={() => go(r)}
                sx={{ borderRadius: '10px', py: 1.25, px: 1.5, display: 'block' }}
              >
                <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                  <Typography sx={{ fontWeight: 600 }} noWrap>{r.dungeon}</Typography>
                  <Typography sx={{ color: 'primary.light', fontWeight: 700 }}>+{r.keystoneLevel}</Typography>
                </Stack>
                <Stack direction="row" spacing={1.5} sx={{ mt: .25, color: 'text.secondary' }}>
                  <Typography variant="caption" sx={{ fontFamily: 'ui-monospace, monospace' }}>
                    {r.reportCode}-{r.fightID}
                  </Typography>
                  <Typography variant="caption">
                    {t('dev.scannedAt', { date: new Date(r.scannedAt).toLocaleString(formatLocale()) })}
                  </Typography>
                </Stack>
              </ListItemButton>
            ))}
          </List>
        </Box>
      </Drawer>
    </>
  );
}
