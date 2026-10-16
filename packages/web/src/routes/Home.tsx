import LinkRoundedIcon from '@mui/icons-material/LinkRounded';
import SearchIcon from '@mui/icons-material/Search';
import {
  Alert, AlertTitle, Box, Button, CircularProgress, Container, FormControlLabel, InputAdornment,
  Paper, Stack, Switch, TextField, Tooltip, Typography,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ApiError, scan } from '../api.js';
import { DEV_MODE } from '../devMode.js';
import { CURSEFORGE_ORANGE, CurseForgeIcon } from '../layout/CurseForgeIcon.js';
import { ADDON_URL, WAGO_URL } from '../layout/links.js';
import { WagoIcon } from '../layout/WagoIcon.js';
import { PALETTE } from '../theme.js';

const STEPS = [
  { n: '1', key: 'paste' },
  { n: '2', key: 'read' },
  { n: '3', key: 'export' },
] as const;

/** Hauteur du bandeau ; la carte de scan remonte de `OVERLAP` pour le chevaucher. */
const HERO_H = 460;
const OVERLAP = 88;

/** Accueil : le scan EST le point d'entrée du site. */
export function Home() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [force, setForce] = useState(false);
  const [error, setError] = useState<{ reason: string; message: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await scan(url, force);
      // On mène directement à la timeline. Le récap n'est plus une étape,
      // il est le début de la page de run.
      navigate(`/runs/${res.reportCode}/${res.fightID}`);
      return;
    } catch (err) {
      setError(
        err instanceof ApiError
          ? { reason: err.reason, message: err.message }
          : { reason: 'network', message: String(err) },
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ pb: 12 }}>
      {/* Bandeau : le fond violet de l'addon, fondu dans la couleur de page vers le bas. */}
      <Box
        sx={{
          position: 'relative',
          height: HERO_H,
          backgroundImage: `
            linear-gradient(180deg, rgba(20,18,43,0) 0%, rgba(20,18,43,.25) 55%, ${PALETTE.bg} 100%),
            url(/hero.webp)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 30%',
        }}
      >
        <Container
          maxWidth="md"
          sx={{ height: '100%', display: 'flex', alignItems: 'center', gap: 4.5, pb: `${OVERLAP / 2}px` }}
        >
          {/* Le logo est le marqueur de la marque : grand, posé sur un halo violet. */}
          <Box
            component="img"
            src="/logo-round.webp"
            alt=""
            sx={{
              width: 168, height: 168, flex: 'none', borderRadius: '50%',
              boxShadow: `0 0 0 2px ${PALETTE.violet}, 0 0 60px 6px rgba(157,140,245,.45), 0 20px 50px rgba(0,0,0,.55)`,
            }}
          />
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: 'primary.light' }}>{t('home.hero.eyebrow')}</Typography>
            {/* Les initiales reprennent les couleurs du logo : le nom se lit comme l'acronyme. */}
            <Typography
              variant="h1"
              sx={{ mt: .5, fontSize: '2.9rem', fontWeight: 800, lineHeight: 1.1, whiteSpace: 'nowrap', textShadow: '0 2px 24px rgba(0,0,0,.5)' }}
            >
              <Trans
                i18nKey="home.hero.name"
                components={{
                  e: <Box component="span" sx={{ color: PALETTE.ecpGreen }} />,
                  c: <Box component="span" sx={{ color: PALETTE.ecpOrange }} />,
                  p: <Box component="span" sx={{ color: PALETTE.ecpBlue }} />,
                }}
              />
            </Typography>
            <Typography sx={{ mt: 1.5, fontSize: '1.45rem', fontWeight: 600, color: 'primary.light' }}>
              {t('home.hero.title')}
            </Typography>
            <Typography sx={{ mt: 1.5, maxWidth: 520, fontSize: '1.05rem', color: 'rgba(238,236,251,.85)' }}>
              {t('home.hero.subtitle')}
            </Typography>
          </Box>
        </Container>
      </Box>

      <Container maxWidth="md">
        <Paper
          variant="outlined"
          sx={{
            mt: `-${OVERLAP}px`,
            position: 'relative',
            p: 4,
            borderRadius: '16px',
            bgcolor: 'rgba(29,26,58,.82)',
            backdropFilter: 'blur(14px)',
            borderColor: 'rgba(179,158,244,.25)',
            boxShadow: '0 24px 60px -20px rgba(0,0,0,.6)',
          }}
        >
          <Typography variant="h2" sx={{ mb: 2.5 }}>{t('home.scan.title')}</Typography>
          <Stack component="form" direction="row" spacing={1.5} onSubmit={submit}>
            <TextField
              fullWidth type="url" required value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={t('home.scan.placeholder')}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <LinkRoundedIcon sx={{ color: 'text.secondary' }} />
                    </InputAdornment>
                  ),
                  sx: { fontFamily: 'ui-monospace, monospace', fontSize: '.9rem', bgcolor: 'rgba(16,14,34,.6)' },
                },
              }}
            />
            <Button
              type="submit" variant="contained" size="large" disabled={busy || !url}
              startIcon={busy ? <CircularProgress size={18} color="inherit" /> : <SearchIcon />}
              sx={{ flexShrink: 0, px: 4 }}
            >
              {busy ? t('home.scan.submitting') : t('home.scan.submit')}
            </Button>
          </Stack>

          <Stack direction="row" spacing={2} sx={{ mt: 2.5, alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
              <Trans i18nKey="home.scan.hint" components={{ code: <code /> }} />
            </Typography>
            {/* Un scan forcé coûte des points WCL : outil de dev, refusé par l'API en production. */}
            {DEV_MODE && (
              <Tooltip title={t('home.scan.forceHelp')}>
                <FormControlLabel
                  control={<Switch size="small" checked={force} onChange={(e) => setForce(e.target.checked)} />}
                  label={<Typography variant="body2" sx={{ color: 'text.secondary' }}>{t('home.scan.force')}</Typography>}
                  sx={{ mr: 0, flexShrink: 0 }}
                />
              </Tooltip>
            )}
          </Stack>

          {error && (
            <Alert severity="error" sx={{ mt: 3 }}>
              <AlertTitle sx={{ fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }}>
                {error.reason}
              </AlertTitle>
              {error.message}
            </Alert>
          )}
        </Paper>

        <Box sx={{ mt: 10, display: 'grid', gap: 5, gridTemplateColumns: 'repeat(3, 1fr)' }}>
          {STEPS.map((s) => (
            <Box key={s.n}>
              <Box
                sx={{
                  width: 32, height: 32, borderRadius: '50%', display: 'grid', placeItems: 'center',
                  bgcolor: 'rgba(157,140,245,.16)', color: 'primary.light', fontWeight: 700, fontSize: '.9rem',
                }}
              >
                {s.n}
              </Box>
              <Typography variant="h3" sx={{ mt: 2 }}>{t(`home.steps.${s.key}.title`)}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary', mt: .75 }}>{t(`home.steps.${s.key}.text`)}</Typography>
            </Box>
          ))}
        </Box>

        <Paper
          variant="outlined"
          sx={{
            mt: 10,
            p: 4,
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'linear-gradient(135deg, rgba(157,140,245,.10), rgba(29,26,58,.6) 60%)',
          }}
        >
          <Box component="img" src="/logo.png" alt="" sx={{ width: 96, height: 96, borderRadius: '20px', flex: 'none' }} />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h2">{t('home.addon.title')}</Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1, maxWidth: 480 }}>
              {t('home.addon.text')}
            </Typography>
          </Box>
          <Stack spacing={1.25} sx={{ flexShrink: 0 }}>
            <Button
              href={ADDON_URL}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              size="large"
              startIcon={<CurseForgeIcon />}
              sx={{ justifyContent: 'flex-start', bgcolor: CURSEFORGE_ORANGE, color: '#fff', '&:hover': { bgcolor: '#d9532a' } }}
            >
              {t('home.addon.ctaCurseforge')}
            </Button>
            <Button
              href={WAGO_URL}
              target="_blank"
              rel="noopener noreferrer"
              variant="contained"
              size="large"
              startIcon={<WagoIcon />}
              sx={{ justifyContent: 'flex-start', bgcolor: '#0d0d0f', color: '#fff', '&:hover': { bgcolor: '#1c1c20' } }}
            >
              {t('home.addon.ctaWago')}
            </Button>
          </Stack>
        </Paper>
      </Container>
    </Box>
  );
}
