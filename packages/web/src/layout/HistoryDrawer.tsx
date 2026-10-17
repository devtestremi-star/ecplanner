import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import {
  Box, Button, Drawer, IconButton, List, ListItemButton, Stack, Tooltip, Typography,
} from '@mui/material';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { HISTORY_MAX, historyStore, type HistoryEntry } from '../history.js';
import { formatLocale } from '../i18n/index.js';
import { iconUrl } from '../spells/catalog.js';

/**
 * Historique des runs consultées, ouvert depuis la sidebar. Tout vient du navigateur :
 * aucune requête, la liste s'affiche même hors ligne.
 */
export function HistoryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const entries = useSyncExternalStore(historyStore.subscribe, historyStore.get);

  const go = (e: HistoryEntry) => {
    onClose();
    navigate(`/runs/${e.reportCode}/${e.fightID}`);
  };

  return (
    <Drawer anchor="right" open={open} onClose={onClose}>
      <Box sx={{ width: 440, p: 3, display: 'flex', flexDirection: 'column', height: '100%' }}>
        <Stack direction="row" sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h2">{t('history.title')}</Typography>
          <IconButton onClick={onClose} aria-label={t('history.close')}>
            <CloseRoundedIcon />
          </IconButton>
        </Stack>
        <Typography variant="body2" sx={{ color: 'text.secondary', mt: .5 }}>
          {t('history.subtitle', { count: HISTORY_MAX })}
        </Typography>

        {entries.length === 0 && (
          <Typography variant="body2" sx={{ color: 'text.secondary', mt: 3 }}>{t('history.empty')}</Typography>
        )}

        <List sx={{ mt: 2, overflowY: 'auto', flex: 1 }}>
          {entries.map((e) => (
            <ListItemButton
              key={`${e.reportCode}-${e.fightID}`}
              onClick={() => go(e)}
              sx={{ borderRadius: '10px', py: 1.25, px: 1.5, display: 'block' }}
            >
              <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
                <Typography sx={{ fontWeight: 600 }} noWrap>{e.dungeon}</Typography>
                <Typography sx={{ color: e.kill ? 'primary.light' : 'error.main', fontWeight: 700 }}>
                  +{e.keystoneLevel}
                </Typography>
              </Stack>

              {/* Composition : healer, tank, puis dps. */}
              <Stack direction="row" spacing={.5} sx={{ mt: .75 }}>
                {e.players.map((p, i) => {
                  const src = iconUrl(p.icon, 36);
                  return (
                    <Tooltip key={i} title={`${p.name}${p.label ? ` - ${p.label}` : ''}`} placement="top">
                      <Box
                        sx={{
                          width: 24, height: 24, borderRadius: '6px', overflow: 'hidden', flex: 'none',
                          border: '2px solid', borderColor: p.color ?? 'divider', bgcolor: 'background.default',
                        }}
                      >
                        {src && <Box component="img" src={src} alt={p.label} sx={{ width: '100%', height: '100%', display: 'block' }} />}
                      </Box>
                    </Tooltip>
                  );
                })}
              </Stack>

              <Stack direction="row" spacing={1.5} sx={{ mt: .75, color: 'text.secondary' }}>
                <Typography variant="caption" sx={{ fontFamily: 'ui-monospace, monospace' }}>
                  {e.reportCode}-{e.fightID}
                </Typography>
                <Typography variant="caption">
                  {t('history.viewedAt', { date: new Date(e.viewedAt).toLocaleString(formatLocale()) })}
                </Typography>
              </Stack>
            </ListItemButton>
          ))}
        </List>

        {entries.length > 0 && (
          <Button size="small" color="inherit" onClick={historyStore.clear} sx={{ alignSelf: 'flex-end', color: 'text.secondary', mt: 1 }}>
            {t('history.clear')}
          </Button>
        )}
      </Box>
    </Drawer>
  );
}
