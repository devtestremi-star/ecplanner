import VisibilityOffRoundedIcon from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import { Box, IconButton, Stack, Tooltip, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import type { RunDetail } from '../api.js';
import { SpellIcon } from '../spells/SpellIcon.js';
import { iconUrl, type SpellSummary } from '../spells/catalog.js';
import { CATEGORY_COLOR, categoryOf, type Category } from './categories.js';

/** Clé d'un sort masqué pour UN joueur : `sourceID-spellId`. */
export const playerSpellKey = (sourceID: number, spellId: number): string => `${sourceID}-${spellId}`;

/** `?spellOff=12-31884,15-740`. Une entrée mal formée est ignorée, pas fatale. */
export const parsePlayerSpells = (raw: string | null): Set<string> =>
  new Set((raw ?? '').split(',').filter((k) => /^\d+-\d+$/.test(k)));

export const serializePlayerSpells = (keys: ReadonlySet<string>): string => [...keys].sort().join(',');

/** `?playerOff=12,15` : joueurs masqués en entier. */
export const parsePlayers = (raw: string | null): Set<number> =>
  new Set((raw ?? '').split(',').filter((k) => /^\d+$/.test(k)).map(Number));

/** Tank, soigneur, puis dps : le même ordre que les pistes de la timeline. */
const ROLE_ORDER = { tank: 0, healer: 1, dps: 2 } as const;

export interface PlayerSpellFilterProps {
  /** Run restreinte au boss affiché : on ne propose que ce qui a été lancé sur ce combat. */
  detail: RunDetail;
  catalog: Map<number, SpellSummary>;
  categories: ReadonlySet<Category>;
  hidden: ReadonlySet<string>;
  onToggle: (key: string) => void;
  hiddenPlayers: ReadonlySet<number>;
  onTogglePlayer: (sourceID: number) => void;
}

/**
 * Filtre avancé : une colonne par joueur, ses sorts dessous. Un clic masque CE sort pour
 * CE joueur seulement — le Barkskin du tank peut disparaître sans toucher à celui du druide
 * soigneur.
 */
export function PlayerSpellFilter({
  detail, catalog, categories, hidden, onToggle, hiddenPlayers, onTogglePlayer,
}: PlayerSpellFilterProps) {
  const { t } = useTranslation();
  const players = [...detail.participants].sort(
    (a, b) => (ROLE_ORDER[a.role ?? 'dps'] - ROLE_ORDER[b.role ?? 'dps']) || a.sourceID - b.sourceID,
  );

  const columns = players.map((p) => {
    const counts = new Map<number, number>();
    for (const b of detail.bosses) {
      for (const c of b.casts) {
        if (c.sourceID === p.sourceID) counts.set(c.abilityGameID, (counts.get(c.abilityGameID) ?? 0) + 1);
      }
    }
    const spells = [...counts.entries()]
      .map(([spellId, n]) => ({ spellId, n, spell: catalog.get(spellId) }))
      .filter((s) => s.spell)
      .sort((a, b) => b.n - a.n);
    return { player: p, spells };
  });

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: `repeat(${players.length}, minmax(0, 1fr))`, gap: 2.5 }}>
      {columns.map(({ player: p, spells }) => {
        const icon = iconUrl(p.specIcon ?? p.classIcon, 18);
        const playerOff = hiddenPlayers.has(p.sourceID);
        return (
          <Box key={p.sourceID} sx={{ minWidth: 0 }}>
            <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mb: 1.25, opacity: playerOff ? .5 : 1 }}>
              {icon && (
                <Box component="img" src={icon} alt="" sx={{ width: 18, height: 18, borderRadius: '4px', flex: 'none' }} />
              )}
              <Typography
                variant="body2"
                noWrap
                sx={{ flex: 1, minWidth: 0, fontWeight: 600, color: p.color ?? 'text.primary', textDecoration: playerOff ? 'line-through' : 'none' }}
              >
                {p.name}
              </Typography>
              <Tooltip title={playerOff ? t('playerSpells.showPlayer') : t('playerSpells.hidePlayer')} placement="top">
                <IconButton
                  size="small"
                  onClick={() => onTogglePlayer(p.sourceID)}
                  aria-label={playerOff ? t('playerSpells.showPlayer') : t('playerSpells.hidePlayer')}
                  sx={{ p: .25, color: playerOff ? 'text.secondary' : 'text.primary' }}
                >
                  {playerOff ? <VisibilityOffRoundedIcon fontSize="small" /> : <VisibilityRoundedIcon fontSize="small" />}
                </IconButton>
              </Tooltip>
            </Stack>

            {/* Joueur masqué : ses sorts restent réglables, mais grisés. */}
            <Stack spacing={.75} sx={{ opacity: playerOff ? .35 : 1, transition: 'opacity .12s' }}>
              {spells.map(({ spellId, n, spell }) => {
                const key = playerSpellKey(p.sourceID, spellId);
                const off = hidden.has(key);
                // Même code que les puces de catégorie : pleine si la catégorie est affichée,
                // contour seul si elle est désactivée. L'exclusion volontaire, elle, barre le nom.
                const cat = categoryOf(spell, p.specId);
                const color = CATEGORY_COLOR[cat];
                const byCategory = !categories.has(cat);
                const title = byCategory ? t('playerSpells.hiddenByCategory') : off ? t('bossSpells.show') : t('bossSpells.hide');
                return (
                  <Tooltip key={spellId} title={title} placement="top">
                    <Stack
                      direction="row"
                      spacing={.75}
                      onClick={() => onToggle(key)}
                      sx={{
                        alignItems: 'center',
                        cursor: 'pointer',
                        px: .75, py: .35,
                        border: '1px solid',
                        borderColor: color,
                        borderRadius: '999px',
                        userSelect: 'none',
                        fontWeight: 600,
                        ...(byCategory
                          ? { bgcolor: 'transparent', color }
                          : { bgcolor: color, color: '#0b0d11' }),
                        opacity: off ? .6 : 1,
                        transition: 'opacity .12s, filter .12s',
                        '&:hover': { filter: 'brightness(1.15)' },
                      }}
                    >
                      {spell && <SpellIcon spell={spell} size={18} />}
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{ flex: 1, minWidth: 0, fontWeight: 'inherit', textDecoration: off ? 'line-through' : 'none', textDecorationThickness: '2px' }}
                      >
                        {spell?.name ?? spellId}
                      </Typography>
                      <Typography variant="caption" sx={{ fontWeight: 'inherit', opacity: .75 }}>{n}</Typography>
                    </Stack>
                  </Tooltip>
                );
              })}
              {spells.length === 0 && (
                <Typography variant="caption" sx={{ color: 'text.secondary' }}>{t('playerSpells.none')}</Typography>
              )}
            </Stack>
          </Box>
        );
      })}
    </Box>
  );
}
