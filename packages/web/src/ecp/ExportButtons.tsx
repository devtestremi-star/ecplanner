import { Alert, Button, Snackbar, Stack, Tooltip } from '@mui/material';
import { useState } from 'react';
import { ApiError, fetchEcpExport } from '../api.js';

/**
 * Export d'un plan vers l'addon EiikoCooldownPlanner.
 *
 * La chaîne est écrite dans le presse-papier DEPUIS LA VARIABLE JavaScript, jamais depuis
 * un nœud du DOM. C'est ce qui élimine la classe de panne la plus vicieuse du format :
 * un rendu HTML ou une sélection à la souris qui avale quelques caractères produit un
 * base64 encore décodable mais tronqué, et l'addon rejette sans qu'on sache pourquoi.
 */
export interface ExportButtonsProps {
  reportCode: string;
  fightID: number;
  /** Boss affiché, pour l'export restreint. */
  bossEncounterID: number | undefined;
  bossName: string | undefined;
}

type Feedback = { severity: 'success' | 'error'; message: string } | null;

export function ExportButtons({ reportCode, fightID, bossEncounterID, bossName }: ExportButtonsProps) {
  const [busy, setBusy] = useState<'boss' | 'dungeon' | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  async function run(scope: 'boss' | 'dungeon'): Promise<void> {
    setBusy(scope);
    try {
      const { wire, fingerprint } = await fetchEcpExport(
        reportCode,
        fightID,
        scope === 'boss' ? bossEncounterID : undefined,
      );
      await navigator.clipboard.writeText(wire);
      setFeedback({
        severity: 'success',
        message: `Copié — ${wire.length} caractères${fingerprint ? ` · empreinte ${fingerprint}` : ''}. Coller dans l'addon.`,
      });
    } catch (err) {
      // `writeText` échoue hors contexte sécurisé ; on ne rend PAS la chaîne en secours,
      // ce serait rétablir le chemin par le DOM que ce bouton existe pour éviter.
      const message =
        err instanceof ApiError
          ? err.message
          : `Copie refusée par le navigateur. Récupérer via /api/runs/${reportCode}/${fightID}/ecp`;
      setFeedback({ severity: 'error', message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        <Tooltip title={bossName ? `Écrase le plan de ${bossName} dans la variante ouverte` : ''}>
          <span>
            <Button
              size="small"
              variant="outlined"
              disabled={busy !== null || bossEncounterID === undefined}
              onClick={() => void run('boss')}
            >
              {busy === 'boss' ? 'Copie…' : 'Export ECP Boss'}
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Crée une variante couvrant tout le donjon">
          <span>
            <Button
              size="small"
              variant="outlined"
              disabled={busy !== null}
              onClick={() => void run('dungeon')}
            >
              {busy === 'dungeon' ? 'Copie…' : 'Export ECP Dungeon'}
            </Button>
          </span>
        </Tooltip>
      </Stack>

      <Snackbar
        open={feedback !== null}
        autoHideDuration={feedback?.severity === 'error' ? null : 6000}
        onClose={() => setFeedback(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        {feedback ? (
          <Alert severity={feedback.severity} onClose={() => setFeedback(null)} sx={{ maxWidth: 620 }}>
            {feedback.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </>
  );
}
