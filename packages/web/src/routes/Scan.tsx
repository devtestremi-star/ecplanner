import SearchIcon from '@mui/icons-material/Search';
import {
  Alert, AlertTitle, Button, CircularProgress, Container, FormControlLabel, Stack, Switch,
  TextField, Tooltip, Typography,
} from '@mui/material';
import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, scan } from '../api.js';

export function Scan() {
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
    <Container maxWidth="md" sx={{ py: 5 }}>
      <Typography variant="h1" gutterBottom>Scanner une run Mythic+</Typography>
      <Typography sx={{ color: 'text.secondary', mb: 3 }}>
        Colle un lien Warcraft Logs pointant sur une run précise.
      </Typography>

      <Stack component="form" direction="row" spacing={1} onSubmit={submit} sx={{ mb: 1.5 }}>
        <TextField
          fullWidth size="small" type="url" required value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.warcraftlogs.com/reports/CODE?fight=3"
          slotProps={{ input: { sx: { fontFamily: 'ui-monospace, monospace', fontSize: '.875rem' } } }}
        />
        <Button
          type="submit" variant="contained" disabled={busy || !url}
          startIcon={busy ? <CircularProgress size={16} color="inherit" /> : <SearchIcon />}
          sx={{ flexShrink: 0 }}
        >
          {busy ? 'Scan…' : 'Scanner'}
        </Button>
      </Stack>

      <Stack direction="row" spacing={2} sx={{ alignItems: 'flex-start', mb: 4, flexWrap: 'wrap' }}>
        <Typography variant="body2" sx={{ color: 'text.secondary', flex: 1, minWidth: 280 }}>
          Le lien doit désigner une run : <code>?fight=3</code>, <code>#fight=3</code> ou{' '}
          <code>?fight=last</code>. Un rapport contient plusieurs runs, une URL nue est refusée.
        </Typography>
        <Tooltip title="Ignore la version en base et réinterroge Warcraft Logs. Coûte ~5 points d'API.">
          <FormControlLabel
            control={<Switch size="small" checked={force} onChange={(e) => setForce(e.target.checked)} />}
            label={<Typography variant="body2">Forcer un nouveau scan</Typography>}
            sx={{ mr: 0, flexShrink: 0 }}
          />
        </Tooltip>
      </Stack>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          <AlertTitle sx={{ fontFamily: 'ui-monospace, monospace', fontSize: '.8rem' }}>
            {error.reason}
          </AlertTitle>
          {error.message}
        </Alert>
      )}

    </Container>
  );
}
