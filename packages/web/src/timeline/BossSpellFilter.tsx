import { Box, Stack, Tooltip, Typography } from '@mui/material';
import type { RunDetail } from '../api.js';
import { SpellIcon } from '../spells/SpellIcon.js';
import type { SpellSummary } from '../spells/catalog.js';

const parseIds = (raw: string | null): Set<number> =>
  new Set((raw ?? '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0));

export const serializeIds = (ids: ReadonlySet<number>): string =>
  [...ids].sort((a, b) => a - b).join(',');

/**
 * Ce qui est masqué vient UNIQUEMENT de l'utilisateur (`?bossOff`). Tout est affiché par
 * défaut.
 *
 * `Spell.inTimeline` reste transmis dans le payload — il documente la curation — mais ne
 * pré-masque plus rien : un tri implicite au premier rendu cachait des sorts réellement
 * lancés sans que rien ne l'explique.
 */
export const resolveHiddenBossSpells = (off: string | null): Set<number> => parseIds(off);


export interface BossSpellFilterProps {
  detail: RunDetail;
  catalog: Map<number, SpellSummary>;
  hidden: ReadonlySet<number>;
  onToggle: (spellId: number) => void;
}

/**
 * Un chip par sort de boss présent dans les combats affichés, avec son icône.
 * Désactivé = désaturé, pas masqué : on doit voir ce qu'on a écarté.
 */
export function BossSpellFilter({ detail, catalog, hidden, onToggle }: BossSpellFilterProps) {
  const playerIds = new Set(detail.participants.map((p) => p.sourceID));

  // Un sort de boss = un cast dont la source n'est pas au roster (même règle qu'en base).
  const counts = new Map<number, number>();
  for (const b of detail.bosses) {
    for (const c of b.casts) {
      if (playerIds.has(c.sourceID)) continue;
      counts.set(c.abilityGameID, (counts.get(c.abilityGameID) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;

  const spells = [...counts.entries()]
    .map(([spellId, n]) => ({ spellId, n, spell: catalog.get(spellId) }))
    .sort((a, b) => b.n - a.n);

  return (
    <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap', alignItems: 'center', mb: 2 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary', mr: .5 }}>Sorts du boss</Typography>
      {spells.map(({ spellId, n, spell }) => {
        const off = hidden.has(spellId);
        return (
          <Tooltip key={spellId} title={off ? 'Masqué — cliquer pour afficher' : 'Cliquer pour masquer'}>
            <Stack
              direction="row"
              spacing={.75}
              onClick={() => onToggle(spellId)}
              sx={{
                alignItems: 'center',
                cursor: 'pointer',
                px: .75, py: .35,
                border: '1px solid',
                borderColor: off ? 'divider' : 'rgba(255,255,255,.22)',
                borderRadius: 1.5,
                userSelect: 'none',
                // Désaturation plutôt que masquage : ce qui est écarté doit rester lisible.
                filter: off ? 'grayscale(1)' : 'none',
                opacity: off ? .45 : 1,
                transition: 'opacity .12s, filter .12s',
                '&:hover': { borderColor: 'rgba(255,255,255,.4)' },
              }}
            >
              {spell ? (
                <SpellIcon spell={spell} size={18} />
              ) : (
                <Box sx={{ width: 18, height: 18, borderRadius: '3px', bgcolor: 'rgba(255,255,255,.08)' }} />
              )}
              <Typography variant="caption" sx={{ whiteSpace: 'nowrap' }}>
                {spell?.name ?? spellId}
              </Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>{n}</Typography>
            </Stack>
          </Tooltip>
        );
      })}
    </Stack>
  );
}
