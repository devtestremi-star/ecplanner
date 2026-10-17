import { Box, Link, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { consentStore, GA_ID } from '../analytics.js';
import { DiscordIcon } from './DiscordIcon.js';
import { DISCORD_URL } from './links.js';

export function Footer() {
  const { t } = useTranslation();
  return (
    <Box component="footer" sx={{ borderTop: '1px solid', borderColor: 'divider', px: 5, py: 3 }}>
      <Stack direction="row" spacing={3} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" spacing={3} sx={{ alignItems: 'center' }}>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('footer.tagline')}</Typography>
          {GA_ID && (
            <Link
              component="button"
              type="button"
              variant="body2"
              underline="hover"
              onClick={() => consentStore.reopen()}
              sx={{ color: 'text.secondary' }}
            >
              {t('footer.cookies')}
            </Link>
          )}
        </Stack>
        <Link
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          underline="none"
          sx={{
            display: 'inline-flex', alignItems: 'center', gap: 1,
            px: 1.75, py: .75, borderRadius: '8px',
            fontWeight: 600, fontSize: '.875rem', color: 'primary.light',
            bgcolor: 'rgba(157,140,245,.12)',
            '&:hover': { bgcolor: 'rgba(157,140,245,.22)' },
          }}
        >
          <DiscordIcon sx={{ fontSize: 18 }} />
          {t('footer.discord')}
        </Link>
      </Stack>
    </Box>
  );
}
