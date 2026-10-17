import { Button, Link, Paper, Stack, Typography } from '@mui/material';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { consentStore, setConsent, type Consent } from '../analytics.js';

/**
 * Bandeau de consentement. Discret, centré en bas, et les deux choix pèsent pareil :
 * refuser doit être aussi simple qu'accepter.
 */
export function ConsentBanner() {
  const { t } = useTranslation();
  const open = useSyncExternalStore(consentStore.subscribe, consentStore.isOpen);
  if (!open) return null;

  const choose = (c: Consent) => {
    consentStore.close();
    setConsent(c);
  };

  return (
    <Paper
      role="dialog"
      aria-label={t('consent.title')}
      elevation={8}
      sx={{
        position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', width: 'calc(100% - 48px)', zIndex: (th) => th.zIndex.snackbar,
        maxWidth: 420, p: 2.5, borderRadius: '14px', border: '1px solid', borderColor: 'divider',
      }}
    >
      <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: .75 }}>{t('consent.title')}</Typography>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {t('consent.body')}{' '}
        <Link href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">
          {t('consent.learnMore')}
        </Link>
      </Typography>
      <Stack direction="row" spacing={1} sx={{ mt: 2, justifyContent: 'flex-end' }}>
        <Button size="small" variant="outlined" onClick={() => choose('denied')}>{t('consent.decline')}</Button>
        <Button size="small" variant="contained" onClick={() => choose('granted')}>{t('consent.accept')}</Button>
      </Stack>
    </Paper>
  );
}
