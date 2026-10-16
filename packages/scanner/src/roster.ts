import { z } from 'zod';
import {
  AbilitySchema,
  ActorSchema,
  CombatantInfoSchema,
  flattenRoster,
  REPORT_COMBATANT_INFO,
  REPORT_ROSTER,
  type Role,
  type WclClient,
} from '@timeline/wcl';

export interface RosterMember {
  /** Local au rapport — le pont, jamais un id durable. */
  sourceID: number;
  /** Identifiant global WCL, stable entre rapports. */
  guid: number;
  name: string;
  server: string;
  region: string;
  /** Nom de classe tel que renvoyé par WCL : "DeathKnight", "Druid"… */
  className: string;
  role: Role;
  /** specID Blizzard, depuis `CombatantInfo`. Absent si le joueur n'a pas de CombatantInfo. */
  specID: number | null;
  talentTree: Array<{ id: number; rank: number; nodeID: number }> | null;
  /** itemID des trinkets équipés, emplacements vides exclus. `null` sans CombatantInfo. */
  trinkets: number[] | null;
}

export interface RosterResult {
  members: RosterMember[];
  /** Acteurs `subType: "Boss"` — leur `gameID` permet de nommer les boss (NOTES E14). */
  bossActors: Array<{ id: number; gameID: number; name: string }>;
  /** `masterData.abilities` : noms et icônes, gratuits puisque dans la même requête. */
  abilities: Array<{ gameID: number; name: string | null; icon: string | null }>;
}

/**
 * Position des deux trinkets dans `CombatantInfo.gear` — slots 13 et 14 du personnage.
 *
 * Le tableau de WCL est positionnel : pas de champ `slot`, c'est l'index qui fait foi.
 * Vérifié sur `recon/dumps/05-combatantinfo.json`, où 12 et 13 portent bien les deux
 * icônes de trinket. Un emplacement vide rend `id: 0`.
 */
const TRINKET_SLOTS = [12, 13] as const;

const MasterDataSchema = z.object({
  actors: z.array(ActorSchema),
  abilities: z.array(AbilitySchema),
});

/**
 * Requête 2/3 (plan §4.1) : roster, acteurs et abilities en un seul call.
 * Doit précéder la requête d'events — les specs construisent le filtre.
 *
 * `CombatantInfo` est une requête distincte : il est émis par fight et porte le specID
 * et le talentTree, qui varient d'une run à l'autre (NOTES E13).
 */
export async function fetchRoster(
  client: WclClient,
  reportCode: string,
  fightID: number,
  window: { startTime: number; endTime: number },
): Promise<RosterResult> {
  const res = await client.query<{
    reportData: { report: { playerDetails: unknown; masterData: unknown } };
  }>(REPORT_ROSTER, { code: reportCode, fightIDs: [fightID] });

  const players = flattenRoster(res.data.reportData.report.playerDetails);
  const master = MasterDataSchema.parse(res.data.reportData.report.masterData);

  const ci = await client.query<{ reportData: { report: { events: { data: unknown[] } | null } } }>(
    REPORT_COMBATANT_INFO,
    { code: reportCode, start: window.startTime, end: window.endTime },
  );
  const infos = new Map<number, z.infer<typeof CombatantInfoSchema>>();
  for (const raw of ci.data.reportData.report.events?.data ?? []) {
    const parsed = CombatantInfoSchema.parse(raw);
    infos.set(parsed.sourceID, parsed);
  }

  const members: RosterMember[] = players.map((p) => {
    const info = infos.get(p.id);
    return {
      sourceID: p.id,
      guid: p.guid,
      name: p.name,
      server: p.server ?? '',
      region: p.region ?? '',
      className: p.type,
      role: p.role,
      specID: info?.specID ?? null,
      talentTree: info?.talentTree ?? null,
      // `null` sans CombatantInfo, comme les talents : « on ne sait pas » et « rien
      // d'équipé » ne se confondent pas.
      trinkets: info ? TRINKET_SLOTS.map((i) => info.gear[i]?.id ?? 0).filter((id) => id > 0) : null,
    };
  });

  const bossActors = master.actors
    .filter((a) => a.subType === 'Boss' && a.gameID != null && a.name != null)
    .map((a) => ({ id: a.id, gameID: a.gameID as number, name: a.name as string }));

  return { members, bossActors, abilities: master.abilities };
}
