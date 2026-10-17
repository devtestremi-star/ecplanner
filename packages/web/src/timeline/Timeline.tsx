import { Box, Paper, Stack, Typography } from '@mui/material';
import { useTranslation } from 'react-i18next';
import { SpellIcon } from '../spells/SpellIcon.js';
import { iconSizeFor, iconUrl, type SpellSummary } from '../spells/catalog.js';
import type { RunDetail } from '../api.js';
import { categoryOf, type Category } from './categories.js';
import { PanScroll } from './PanScroll.js';
import { playerSpellKey } from './PlayerSpellFilter.js';
import { minSeparationMs, packLane } from './stack.js';

/** Pas de zoom : une échelle fixe, et le défilement horizontal fait le reste. */
export const PX_PER_SEC = 6;
const LANE_H = 44;
const ICON = 32;
const LABEL_W = 190;

/**
 * En-dessous de cette séparation à l'écran, l'icône du dessus en masque plus de 90 % —
 * les deux casts sont indiscernables. 3 px à 6 px/s, soit 500 ms : au-delà, le
 * chevauchement partiel reste lisible et on n'y touche pas.
 */
const MIN_SEPARATION_PX = 3;
/**
 * De combien monte chaque cast simultané supplémentaire.
 *
 * Volontairement plus petit qu'une icône : les casts restent en éventail, le premier
 * intact au premier plan et les suivants dépassant derrière lui. C'est exactement cette
 * bande de `STACK_OFFSET` px qui reste visible de chaque successeur — assez pour le
 * reconnaître, sans dégager toute la hauteur d'une icône par cast.
 */
const STACK_OFFSET = 20;

/** Le boss n'est pas un joueur : sa piste ne prend aucune couleur de classe. */
const BOSS_COLOR = '#f85149';
/** Hauteur du bandeau de graduations, au-dessus de la piste du boss. */
const RULER_H = 22;

/** Icônes du récap, classe et spec à l'identique. Plus petites que celle d'un cast :
 *  elles identifient un joueur, elles ne datent rien sur la piste. */
const RECAP_ICON = 26;

/** Pas de graduation, en secondes. Une étiquette toutes les deux, soit chaque minute. */
const TICK_SEC = 30;

/**
 * Fin VISUELLE du ruban, distincte de la fin du combat.
 *
 * Un boss meurt à 3:12 : arrêter le tracé là laisse un ruban tronqué en plein vide, sans
 * graduation ni étiquette pour situer la dernière minute. On prolonge donc jusqu'à la
 * graduation suivante, en gardant au moins une demi-icône de marge pour que le dernier
 * cast ne soit pas collé au bord.
 *
 * Ce que ça coûte : le ruban ne dit plus où le combat s'arrête. C'est le repère de fin
 * de combat, tracé séparément, qui porte cette information.
 */
const MARGIN_SEC = ICON / PX_PER_SEC;
const visualEndSec = (durationMs: number): number =>
  Math.ceil((durationMs / 1000 + MARGIN_SEC) / TICK_SEC) * TICK_SEC;

const mmss = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Instant d'un cast au survol, au dixième : arrondis à la seconde, l'instant réel, celui
 * de l'ancre et leur écart ne se recoupaient pas toujours (0:04 → 0:10, « -5 s »).
 */
const castTime = (ms: number): string => {
  const tenths = Math.max(0, Math.round(ms / 100));
  const s = Math.floor(tenths / 10);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}.${tenths % 10}`;
};

/** Graduations toutes les 30 s, une étiquette toutes les minutes, jusqu'au bout du ruban. */
function Ruler({ endSec }: { endSec: number }) {
  const ticks = [];
  for (let s = 0; s <= endSec; s += TICK_SEC) {
    const minute = s % 60 === 0;
    ticks.push(
      <Box key={s} sx={{ position: 'absolute', left: s * PX_PER_SEC, top: 0, bottom: 0 }}>
        <Box sx={{ width: '1px', height: '100%', bgcolor: minute ? 'rgba(255,255,255,.14)' : 'rgba(255,255,255,.06)' }} />
        {minute && (
          <Typography
            variant="caption"
            sx={{ position: 'absolute', top: 0, left: 4, color: 'text.secondary', fontVariantNumeric: 'tabular-nums' }}
          >
            {mmss(s * 1000)}
          </Typography>
        )}
      </Box>,
    );
  }
  return <>{ticks}</>;
}

export interface TimelineProps {
  detail: RunDetail;
  catalog: Map<number, SpellSummary>;
  /** Catégories à afficher. Un cast filtré n'est pas rendu, mais reste en base. */
  categories: Set<Category>;
  /**
   * Recale les cooldowns de réaction sur le sort de boss qui les a provoqués.
   * Mensonge d'affichage assumé : `offsetBoss` reste intact dans les données.
   */
  aligned?: boolean;
  /** Sorts de boss masqués, par spellId. Filtre d'affichage seulement. */
  hiddenBossSpells?: ReadonlySet<number>;
  /** Sorts masqués pour un joueur précis, clés `sourceID-spellId`. Filtre d'affichage seulement. */
  hiddenPlayerSpells?: ReadonlySet<string>;
  /** Joueurs masqués en entier (`?playerOff`) : leur piste disparaît. */
  hiddenPlayers?: ReadonlySet<number>;
}

export function Timeline({ detail, catalog, categories, hiddenBossSpells, hiddenPlayerSpells, hiddenPlayers, aligned }: TimelineProps) {
  const { t } = useTranslation();
  /**
   * Abscisse effective d'un cast. Un cast sans ancre garde sa position réelle même quand
   * l'alignement est actif — il n'y a rien sur quoi le recaler.
   */
  const at = (c: { offsetBoss: number; ecp_timestamp: number | null }): number =>
    aligned && c.ecp_timestamp !== null ? c.ecp_timestamp : c.offsetBoss;
  const bySource = new Map(detail.participants.map((p) => [p.sourceID, p]));
  // La catégorie dépend de la spec du lanceur : un sort de boss n'en a aucune.
  const specBySource = new Map(detail.participants.map((p) => [p.sourceID, p.specId]));
  // Tank, soigneur, puis dps : l'ordre de lecture d'un groupe.
  const order = { tank: 0, healer: 1, dps: 2 } as const;
  const players = [...detail.participants].sort(
    (a, b) => (order[a.role ?? 'dps'] - order[b.role ?? 'dps']) || a.sourceID - b.sourceID,
  );

  /** Tout sourceID hors du roster est le boss : c'est ce qui les sépare en base. */
  const playerIds = new Set(players.map((p) => p.sourceID));
  const windowMs = minSeparationMs(MIN_SEPARATION_PX, PX_PER_SEC);

  return (
    <Stack spacing={2}>
      {detail.bosses.map((boss) => {
        const endSec = visualEndSec(boss.duration);
        const width = Math.max(400, endSec * PX_PER_SEC + ICON / 2);

        /**
         * Piste du boss, au-dessus des joueurs : c'est lui qui dicte, eux qui réagissent.
         *
         * Volontairement SOUSTRAITE au filtre par catégorie — celui-ci trie les cooldowns
         * joueurs, alors que les capacités de boss sont l'axe de lecture contre lequel on
         * les lit. Les masquer avec « Utilitaires » n'aurait aucun sens.
         */
        const bossLane = packLane(
          boss.casts.filter(
            (c) => !playerIds.has(c.sourceID) && !hiddenBossSpells?.has(c.abilityGameID),
          ),
          (c) => c.offsetBoss,
          windowMs,
        );
        // Piste omise si le boss n'a rien lancé : une run scannée avant la curation des
        // sorts de boss (spellSetVersion 1) n'en contient aucun, autant ne pas réserver le vide.
        const bossLaneH = bossLane.placed.length
          ? LANE_H + (bossLane.rowCount - 1) * STACK_OFFSET
          : 0;

        /**
         * Une piste par joueur, empilée si besoin. Calculé ici et non dans le rendu :
         * la colonne des noms et la piste défilante doivent partager EXACTEMENT les
         * mêmes hauteurs, sinon les lignes se désalignent au premier décalage.
         */
        const lanes = players.filter((p) => !hiddenPlayers?.has(p.sourceID)).map((player) => {
          const casts = boss.casts.filter(
            (c) =>
              c.sourceID === player.sourceID &&
              categories.has(categoryOf(catalog.get(c.abilityGameID), player.specId)) &&
              !hiddenPlayerSpells?.has(playerSpellKey(player.sourceID, c.abilityGameID)),
          );
          const { placed, rowCount } = packLane(casts, at, windowMs);
          return { player, placed, rowCount, height: LANE_H + (rowCount - 1) * STACK_OFFSET };
        });
        const visible = lanes.reduce((n, l) => n + l.placed.length, 0);
        return (
          <Paper key={boss.orderIndex} variant="outlined" sx={{ overflow: 'hidden' }}>
            <Stack
              direction="row"
              spacing={1.5}
              sx={{ alignItems: 'baseline', px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}
            >
              <Typography sx={{ color: 'text.secondary' }}>{boss.orderIndex + 1}</Typography>
              <Typography variant="h2" sx={{ fontSize: '1rem' }}>{boss.name}</Typography>
              <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                {t('timeline.summary', { duration: mmss(boss.duration), visible, total: boss.casts.length })}
                {bossLane.placed.length > 0 && t('timeline.summaryBoss', { count: bossLane.placed.length })}
                {t('timeline.summaryOffset', { offset: mmss(boss.offsetRun) })}
              </Typography>
            </Stack>

            <Box sx={{ display: 'flex' }}>
              {/* Colonne des joueurs, figée hors du défilement */}
              <Box sx={{ flex: 'none', width: LABEL_W, borderRight: '1px solid', borderColor: 'divider' }}>
                <Box sx={{ height: RULER_H }} />
                {bossLaneH > 0 && (
                  <Stack
                    direction="row"
                    spacing={1}
                    sx={{
                      height: bossLaneH, alignItems: 'center', px: 1.5,
                      bgcolor: 'rgba(248,81,73,.06)',
                      borderBottom: '1px solid', borderColor: 'rgba(248,81,73,.25)',
                    }}
                  >
                    <Typography variant="body2" noWrap sx={{ minWidth: 0, color: BOSS_COLOR }}>{boss.name}</Typography>
                  </Stack>
                )}
                {lanes.map(({ player: p, height }) => (
                  <Stack
                    key={p.sourceID}
                    direction="row"
                    spacing={1}
                    sx={{ height, alignItems: 'center', px: 1.5, borderTop: '1px solid', borderColor: 'rgba(255,255,255,.04)' }}
                  >
                    {/* La spec seule : son icône dit déjà la classe à qui lit des logs, et
                        la couleur — bordure et pseudo — relie le joueur à ses casts sur la
                        piste, qui la portent aussi. `classIcon` reste dans la charge utile,
                        simplement plus affiché ici.

                        Repli sur un cadre vide si la spec est inconnue du référentiel : les
                        40 sont curées, mais un specId inattendu ne doit pas décaler la
                        colonne — le scanner le signale déjà par un avertissement. */}
                    {p.specIcon ? (
                      <Box
                        component="img"
                        src={iconUrl(p.specIcon, iconSizeFor(RECAP_ICON)) ?? undefined}
                        alt={[p.class, p.spec].filter(Boolean).join(' - ')}
                        title={[p.class, p.spec].filter(Boolean).join(' - ')}
                        sx={{
                          width: RECAP_ICON, height: RECAP_ICON, flex: 'none', display: 'block',
                          borderRadius: '4px', border: `1px solid ${p.color ?? 'rgba(255,255,255,.2)'}`,
                        }}
                      />
                    ) : (
                      <Box
                        title={p.class ?? undefined}
                        sx={{
                          width: RECAP_ICON, height: RECAP_ICON, flex: 'none',
                          borderRadius: '4px', border: `1px dashed ${p.color ?? 'rgba(255,255,255,.2)'}`,
                        }}
                      />
                    )}
                    {/* Le nom de la spec est porté par son icône et par le title au survol :
                        l'écrire en plus volerait la largeur au pseudo. */}
                    <Typography variant="body2" noWrap sx={{ minWidth: 0, color: p.color ?? undefined }}>
                      {p.name}
                    </Typography>
                  </Stack>
                ))}
              </Box>

              {/* Piste défilante */}
              <PanScroll sx={{ flex: 1 }}>
                <Box sx={{ position: 'relative', width }}>
                  <Box sx={{ position: 'absolute', inset: 0 }}>
                    <Ruler endSec={endSec} />
                    {/* Le ruban continue au-delà du combat : sans ce repère, rien ne
                        distinguerait plus une fin à 3:12 d'une fin à 3:30. */}
                    <Box
                      sx={{
                        position: 'absolute',
                        left: (boss.duration / 1000) * PX_PER_SEC,
                        top: 0,
                        bottom: 0,
                        borderLeft: '2px dashed rgba(255,255,255,.3)',
                      }}
                    >
                      <Typography
                        variant="caption"
                        sx={{ position: 'absolute', top: 0, left: 5, color: 'text.secondary', whiteSpace: 'nowrap' }}
                      >
                        {t('timeline.end')}
                      </Typography>
                    </Box>
                  </Box>

                  <Box sx={{ height: RULER_H }} />
                  {bossLaneH > 0 && (
                    <Box
                      sx={{
                        position: 'relative', height: bossLaneH,
                        bgcolor: 'rgba(248,81,73,.06)',
                        borderBottom: '1px solid', borderColor: 'rgba(248,81,73,.25)',
                      }}
                    >
                      {bossLane.placed.map(({ item: c, row }, i) => {
                        const spell = catalog.get(c.abilityGameID);
                        if (!spell) return null;
                        return (
                          <Box
                            key={`boss-${c.offsetBoss}-${c.abilityGameID}-${i}`}
                            sx={{
                              position: 'absolute',
                              left: (c.offsetBoss / 1000) * PX_PER_SEC - ICON / 2,
                              top: bossLaneH - LANE_H + (LANE_H - ICON) / 2 - row * STACK_OFFSET,
                              zIndex: bossLane.rowCount - row,
                            }}
                          >
                            <SpellIcon
                              spell={spell} size={ICON} borderColor={BOSS_COLOR}
                              caption={t('timeline.castAt', { time: castTime(c.offsetBoss) })}
                            />
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                  {/* Une verticale par cast de boss, du bas de sa piste jusqu'en bas du
                      tableau. Posée APRÈS les pistes pour couvrir leurs fonds et leurs
                      bordures, mais en `zIndex: 0` — les icônes, toutes à 1 ou plus, la
                      recouvrent. Sans quoi elle barrerait les sorts qu'elle sert à situer. */}
                  {bossLane.placed.map(({ item: c }, i) => (
                    <Box
                      key={`line-${c.offsetBoss}-${c.abilityGameID}-${i}`}
                      sx={{
                        position: 'absolute',
                        left: (c.offsetBoss / 1000) * PX_PER_SEC,
                        top: RULER_H + bossLaneH,
                        bottom: 0,
                        borderLeft: `1px solid ${BOSS_COLOR}`,
                        opacity: .35,
                        pointerEvents: 'none',
                        zIndex: 0,
                      }}
                    />
                  ))}
                  {lanes.map(({ player: p, placed, rowCount, height }) => (
                    <Box
                      key={p.sourceID}
                      sx={{ position: 'relative', height, borderTop: '1px solid', borderColor: 'rgba(255,255,255,.04)' }}
                    >
                      {placed.map(({ item: c, row }, i) => {
                        const spell = catalog.get(c.abilityGameID);
                        if (!spell) return null;
                        return (
                          <Box
                            key={`${c.offsetBoss}-${c.abilityGameID}-${i}`}
                            sx={{
                              position: 'absolute',
                              // Seule l'ordonnée bouge à l'empilement ; l'abscisse vient
                              // de `at`, réelle ou recalée selon la bascule.
                              left: (at(c) / 1000) * PX_PER_SEC - ICON / 2,
                              // Rangée 0 en bas de la piste, les suivantes montent.
                              top: height - LANE_H + (LANE_H - ICON) / 2 - row * STACK_OFFSET,
                              /**
                               * Décroissant : le premier cast reste entier au premier
                               * plan, chaque suivant passe DERRIÈRE et ne laisse dépasser
                               * que sa bande haute. Jamais négatif — un z-index négatif
                               * ferait passer l'icône sous le fond de la piste.
                               */
                              zIndex: rowCount - row,
                            }}
                          >
                            <SpellIcon
                              spell={spell} size={ICON} borderColor={p.color ?? undefined}
                              caption={<CastCaption offsetBoss={c.offsetBoss} aligned={aligned ? c.ecp_timestamp : null} />}
                            />
                          </Box>
                        );
                      })}
                    </Box>
                  ))}
                </Box>
              </PanScroll>
            </Box>
          </Paper>
        );
      })}
      {bySource.size === 0 && <Typography color="text.secondary">{t('timeline.noParticipants')}</Typography>}
    </Stack>
  );
}

/**
 * Tête du tooltip d'un cast de joueur : son instant réel, et, en mode ECP, l'instant de
 * la capacité de boss sur laquelle il est recalé avec l'écart. Le recalage déplace
 * l'icône : sans cette ligne, on ne saurait plus quand le sort est vraiment parti.
 */
function CastCaption({ offsetBoss, aligned }: { offsetBoss: number; aligned: number | null }) {
  const { t } = useTranslation();
  if (aligned === null || aligned === offsetBoss) return <>{t('timeline.castAt', { time: castTime(offsetBoss) })}</>;
  const delta = (Math.round((offsetBoss - aligned) / 100) / 10).toFixed(1);
  return (
    <>
      {t('timeline.castAt', { time: castTime(offsetBoss) })}
      <Box component="span" sx={{ display: 'block', color: 'text.secondary', fontWeight: 400 }}>
        {t('timeline.alignedOn', { time: castTime(aligned), delta: `${offsetBoss > aligned ? '+' : ''}${delta}` })}
      </Box>
    </>
  );
}
