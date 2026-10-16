import { z } from 'zod';

/**
 * Zod à la frontière. Le typage statique ne protège de rien : `playerDetails` et `events`
 * sont des scalaires `JSON` non typés par le schéma GraphQL. C'est ici qu'un changement
 * de structure côté WCL doit échouer bruyamment plutôt que silencieusement (plan §3).
 *
 * Chaque forme vient d'un dump réel de la Phase 0 — jamais d'une supposition.
 */

// --- fights ---------------------------------------------------------------

export const DungeonPullSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  encounterID: z.number().int(),
  startTime: z.number(),
  endTime: z.number(),
});

export const FightSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  encounterID: z.number().int(),
  startTime: z.number(),
  endTime: z.number(),
  kill: z.boolean().nullable(),
  keystoneLevel: z.number().int().nullable().optional(),
  keystoneTime: z.number().nullable().optional(),
  keystoneBonus: z.number().int().nullable().optional(),
  keystoneAffixes: z.array(z.number().int()).nullable().optional(),
  friendlyPlayers: z.array(z.number().int()).nullable().optional(),
  gameZone: z.object({ id: z.number().int(), name: z.string() }).nullable().optional(),
  dungeonPulls: z.array(DungeonPullSchema).nullable().optional(),
});

export const ReportSchema = z.object({
  code: z.string(),
  title: z.string().nullable().optional(),
  /** Timestamp ABSOLU (epoch ms) — le seul du système. Ne jamais mélanger. */
  startTime: z.number(),
  endTime: z.number(),
  zone: z.object({ id: z.number().int(), name: z.string() }).nullable().optional(),
  fights: z.array(FightSchema),
});

// --- playerDetails --------------------------------------------------------

export const PlayerSchema = z.object({
  /** = sourceID, local au rapport. */
  id: z.number().int(),
  /** Identifiant global, stable entre rapports. */
  guid: z.number().int(),
  name: z.string(),
  server: z.string().optional(),
  region: z.string().optional(),
  /** Nom de classe : "Druid", "DeathKnight"… */
  type: z.string(),
  /** ⚠️ Tableau d'objets, pas de chaînes — et il peut contenir plusieurs specs. */
  specs: z.array(z.object({ spec: z.string(), count: z.number().int().optional() })).default([]),
  minItemLevel: z.number().optional(),
  maxItemLevel: z.number().optional(),
});

/** ⚠️ Double imbrication constatée : `{ data: { playerDetails: { tanks, healers, dps } } }`. */
export const PlayerDetailsSchema = z.object({
  data: z.object({
    playerDetails: z.object({
      tanks: z.array(PlayerSchema).default([]),
      healers: z.array(PlayerSchema).default([]),
      dps: z.array(PlayerSchema).default([]),
    }),
  }),
});

export type Role = 'tank' | 'healer' | 'dps';

export function flattenRoster(
  raw: unknown,
): Array<z.infer<typeof PlayerSchema> & { role: Role }> {
  const { data } = PlayerDetailsSchema.parse(raw);
  const { tanks, healers, dps } = data.playerDetails;
  return [
    ...tanks.map((p) => ({ ...p, role: 'tank' as const })),
    ...healers.map((p) => ({ ...p, role: 'healer' as const })),
    ...dps.map((p) => ({ ...p, role: 'dps' as const })),
  ];
}

// --- masterData -----------------------------------------------------------

export const ActorSchema = z.object({
  id: z.number().int(),
  gameID: z.number().int().nullable().optional(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  subType: z.string().nullable().optional(),
  petOwner: z.number().int().nullable().optional(),
});

export const AbilitySchema = z.object({
  gameID: z.number().int(),
  name: z.string().nullable(),
  icon: z.string().nullable(),
  /** ⚠️ CHAÎNE, pas un nombre : "0", "1", "96". École de magie. Vérifié sur 787 entrées. */
  type: z.string().nullable().optional(),
});

// --- events ---------------------------------------------------------------

/**
 * Forme constatée : `{ timestamp, type, sourceID, targetID, abilityGameID, fight }`.
 * `.passthrough()` volontaire : `dataType: All` ramène des types d'events porteurs de
 * champs supplémentaires (`killingAbilityGameID`, `extraAbilityGameID`…), et
 * `abilityGameID` peut valoir 0 selon le type (NOTES §2.3).
 */
export const EventSchema = z
  .object({
    timestamp: z.number(),
    type: z.string(),
    sourceID: z.number().int().optional(),
    targetID: z.number().int().optional(),
    abilityGameID: z.number().int().optional(),
    fight: z.number().int().optional(),
  })
  .passthrough();

export const EventPageSchema = z.object({
  data: z.array(EventSchema),
  nextPageTimestamp: z.number().nullable(),
});

// --- CombatantInfo --------------------------------------------------------

/** ⚠️ `talents` est un tableau vide côté WCL — le vrai contenu est `talentTree`. */
export const CombatantInfoSchema = z
  .object({
    timestamp: z.number(),
    sourceID: z.number().int(),
    fight: z.number().int().optional(),
    specID: z.number().int().optional(),
    talentTree: z
      .array(z.object({ id: z.number().int(), rank: z.number().int(), nodeID: z.number().int() }))
      .default([]),
    /**
     * Équipement au moment du pull. Seuls l'`id` et la POSITION nous intéressent : le
     * tableau est positionnel — aucun champ `slot` — donc c'est l'index qui désigne
     * l'emplacement. Un emplacement vide rend `id: 0`, il n'est jamais omis.
     *
     * `passthrough` : le reste (ilvl, gemmes, bonusIDs, enchants) est volumineux et sans
     * usage ici, mais le rejeter ferait échouer le parse à la moindre évolution de WCL.
     */
    gear: z.array(z.object({ id: z.number().int() }).passthrough()).default([]),
  })
  .passthrough();

// --- gameData -------------------------------------------------------------

export const GameAbilitySchema = z.object({
  id: z.number().int(),
  name: z.string().nullable(),
  icon: z.string().nullable(),
});

export const GameSpecSchema = z.object({
  /** ⚠️ Index PAR CLASSE, pas le specID Blizzard. Guardian = 3 ici, 104 côté CombatantInfo. */
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
});

export const GameClassSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  slug: z.string(),
  specs: z.array(GameSpecSchema).default([]),
});

export type Fight = z.infer<typeof FightSchema>;
export type Report = z.infer<typeof ReportSchema>;
export type DungeonPull = z.infer<typeof DungeonPullSchema>;
export type Player = z.infer<typeof PlayerSchema>;
export type Actor = z.infer<typeof ActorSchema>;
export type Ability = z.infer<typeof AbilitySchema>;
export type WclEvent = z.infer<typeof EventSchema>;
export type CombatantInfo = z.infer<typeof CombatantInfoSchema>;
