import { Box, Chip, CircularProgress, Container, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { SpellIcon } from '../spells/SpellIcon.js';
import { loadCatalog, type SpellSummary } from '../spells/catalog.js';
import { CATEGORY_COLOR } from '../timeline/categories.js';

// Même palette que la timeline : une catégorie garde sa couleur d'un écran à l'autre.
const CAT_COLOR: Record<string, string> = { ...CATEGORY_COLOR, BOSS: '#e06c75' };

/** Page de contrôle du rendu : toutes les icônes du catalogue, tooltip au survol. */
export function Spells() {
  const [spells, setSpells] = useState<SpellSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadCatalog()
      .then((m) => setSpells([...m.values()]))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) return <Container sx={{ py: 5 }}><Typography color="error">{error}</Typography></Container>;
  if (!spells) return <Container sx={{ py: 5 }}><CircularProgress size={20} /></Container>;

  const byCat = new Map<string, SpellSummary[]>();
  for (const s of spells) {
    const k = s.category ?? 'UTILITY';
    byCat.set(k, [...(byCat.get(k) ?? []), s]);
  }

  return (
    <Container maxWidth="lg" sx={{ py: 5 }}>
      <Typography variant="h1" gutterBottom>Catalogue des sorts</Typography>
      <Typography sx={{ color: 'text.secondary', mb: 4 }}>
        {spells.length} sorts. Survole une icône pour son tooltip Wowhead.
      </Typography>

      {[...byCat.entries()].sort((a, b) => b[1].length - a[1].length).map(([cat, list]) => (
        <Box key={cat} sx={{ mb: 4 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.5 }}>
            <Chip size="small" label={cat} sx={{ bgcolor: CAT_COLOR[cat], color: '#0b0d11', fontWeight: 600 }} />
            <Typography variant="body2" sx={{ color: 'text.secondary' }}>{list.length}</Typography>
          </Stack>
          <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
            {list.map((s) => <SpellIcon key={s.spellId} spell={s} borderColor={CAT_COLOR[cat]} />)}
          </Stack>
        </Box>
      ))}
    </Container>
  );
}
