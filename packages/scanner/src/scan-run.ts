import type { EntityManager } from '@mikro-orm/postgresql';
import {
  Boss,
  type CompactEvent,
  Dungeon,
  type RunParticipant,
  ScannedBoss,
  ScannedRun,
  Season,
} from '@timeline/db';
import { wowClassByName, wowSpec } from '@timeline/shared';
import { fetchAllEvents, WORLD_ZONE, type WclClient } from '@timeline/wcl';
import { resolveRun } from './resolve.js';
import { fetchRoster, type RosterMember } from './roster.js';
import { buildSpellFilter } from './spell-filter.js';

/**
 * Version de la liste de sorts ayant servi au scan — permet de re-scanner le delta.
 *
 * 2 : ajout des sorts de boss curés (`boss-spells.json`). Les runs en version 1 ont été
 * scannées sans eux — leurs fenêtres de boss ne contiennent que des casts joueurs, et
 * l'absence de cast de boss n'y signifie donc rien.
 */
export const SPELL_SET_VERSION = 2;

/**
 * Fenêtre en deçà de laquelle deux events du même sort par la même source comptent pour
 * une seule utilisation. Couvre l'étalement d'un sort multi-cible — Mana Bomb rend un
 * `cast` par joueur touché, parfois à 1 ms d'écart — sans risquer de fusionner deux vraies
 * utilisations : le plus court cooldown suivi est de 28 s.
 */
const MULTI_TARGET_TOLERANCE_MS = 500;

export interface ScanResult {
  reportCode: string;
  fightID: number;
  bosses: number;
  participants: number;
  eventsStored: number;
  eventsDropped: number;
  /** null si le solde de départ n'était pas connu — jamais un chiffre inventé. */
  pointsSpent: number | null;
  warnings: string[];
}

const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

export async function scanRun(
  em: EntityManager,
  client: WclClient,
  reportCode: string,
  fightID: number | 'last',
): Promise<ScanResult> {
  const warnings: string[] = [];
  const before = client.lastPointsSpent;

  // --- 1/3 fights ---------------------------------------------------------
  const run = await resolveRun(client, reportCode, fightID);
  const fight = run.fight;

  // --- 2/3 roster ---------------------------------------------------------
  const roster = await fetchRoster(client, reportCode, fight.id, {
    startTime: fight.startTime,
    endTime: fight.endTime,
  });

  const specIds = [...new Set(roster.members.map((m) => m.specID).filter((s): s is number => s != null))];
  if (specIds.length < roster.members.length) {
    warnings.push(`${roster.members.length - specIds.length} joueur(s) sans CombatantInfo — spec inconnue`);
  }

  // --- filtre, construit AVANT la requête coûteuse ------------------------
  const filter = await buildSpellFilter(em, specIds);

  // --- 3/3 events ---------------------------------------------------------
  const { events, pages } = await fetchAllEvents(client, {
    reportCode,
    startTime: fight.startTime,
    endTime: fight.endTime,
    filter: filter.expression,
  });

  // Un sourceID absent du roster ne doit jamais créer de participant.
  const known = new Set(roster.members.map((m) => m.sourceID));
  // Les boss lancent leurs propres sorts depuis que la curation les fait entrer dans le
  // filtre : ce sont des sources légitimes, pas des orphelins.
  const bossSources = new Set(roster.bossActors.map((a) => a.id));
  // -1 = Environment (events `death`), ce n'est pas un acteur : hors du contrôle d'orphelins.
  const orphans = [...new Set(events.map((e) => e.sourceID).filter((s): s is number => s != null))].filter(
    (s) => s >= 0 && !known.has(s) && !bossSources.has(s),
  );
  if (orphans.length) warnings.push(`sourceID hors roster : ${orphans.join(', ')}`);

  // --- persistance --------------------------------------------------------
  // Le seed ne connaît que la saison courante ; un utilisateur peut soumettre un log
  // plus ancien. On découvre la saison au vol plutôt que de refuser le scan.
  let season = await em.findOne(Season, { zoneId: run.zoneId });
  if (!season) {
    const z = await client.query<{
      worldData: { zone: { id: number; name: string; expansion: { id: number } | null } | null };
    }>(WORLD_ZONE, { id: run.zoneId });
    const zone = z.data.worldData.zone;
    if (!zone) throw new Error(`Zone ${run.zoneId} introuvable côté WCL`);
    season = em.create(Season, {
      zoneId: zone.id,
      name: zone.name,
      expansionId: zone.expansion?.id ?? 0,
      active: false,
    } as Season);
    await em.persistAndFlush(season);
    warnings.push(`saison "${zone.name}" (zone ${zone.id}) découverte et créée`);
  }

  // Le seed dérive gameZoneId du suffixe de l'encounterID ; ici on a la vraie valeur.
  let dungeon = await em.findOne(Dungeon, { gameZoneId: run.gameZoneId });
  if (!dungeon) {
    dungeon = em.create(Dungeon, {
      gameZoneId: run.gameZoneId,
      slug: normalize(fight.gameZone?.name ?? `zone-${run.gameZoneId}`),
      name: fight.gameZone?.name ?? `Zone ${run.gameZoneId}`,
    } as Dungeon);
    em.persist(dungeon);
    warnings.push(`donjon ${run.gameZoneId} inconnu du seed — créé à la volée`);
    await em.flush();
  }

  // Boss : aucune source API ne les liste, on les upserte à la découverte (NOTES E2/E14).
  const bossByName = new Map(roster.bossActors.map((a) => [normalize(a.name), a]));
  for (const b of run.bosses) {
    let boss = await em.findOne(Boss, { encounterID: b.encounterID });
    if (!boss) {
      const actor = bossByName.get(normalize(b.name));
      boss = em.create(Boss, {
        encounterID: b.encounterID,
        npcGameId: actor?.gameID,
        dungeon: em.getReference(Dungeon, run.gameZoneId, { wrapped: true }),
        slug: normalize(b.name),
        name: actor?.name ?? b.name,
      } as unknown as Boss);
      em.persist(boss);
    } else if (boss.name !== b.name) {
      warnings.push(`boss ${b.encounterID} : référentiel "${boss.name}" vs rapport "${b.name}"`);
    }
  }
  await em.flush();

  // Identité des joueurs, figée dans la run (plan §5.3).
  const participants: RunParticipant[] = [];
  for (const m of roster.members) {
    const cls = wowClassByName(m.className);
    if (!cls) {
      warnings.push(`classe inconnue "${m.className}" pour ${m.name} — joueur ignoré`);
      continue;
    }
    if (m.specID == null) {
      warnings.push(`${m.name} sans CombatantInfo — joueur ignoré`);
      continue;
    }
    if (!wowSpec(m.specID)) {
      warnings.push(`specID ${m.specID} inconnu du référentiel — ${m.name} conservé sans spec nommée`);
    }
    participants.push({
      sourceID: m.sourceID,
      guid: m.guid,
      name: m.name,
      server: m.server,
      region: m.region,
      classId: cls.id,
      specId: m.specID,
      role: m.role,
      talentTree: m.talentTree,
      trinkets: m.trinkets,
    });
  }

  // La run — remplacée intégralement si elle existe déjà (un rapport terminé est immuable).
  await em.nativeDelete(ScannedRun, { reportCode, fightID: fight.id });
  const scanned = em.create(ScannedRun, {
    reportCode,
    fightID: fight.id,
    season: em.getReference(Season, season.id, { wrapped: true }),
    dungeonEncounterID: fight.encounterID,
    dungeon: em.getReference(Dungeon, run.gameZoneId, { wrapped: true }),
    keystoneLevel: fight.keystoneLevel ?? 0,
    keystoneTime: fight.keystoneTime ?? 0,
    keystoneBonus: fight.keystoneBonus ?? 0,
    keystoneAffixes: fight.keystoneAffixes ?? [],
    kill: fight.kill ?? false,
    startedAt: run.startedAt,
    startTime: fight.startTime,
    duration: fight.endTime - fight.startTime,
    participants,
    spellSetVersion: SPELL_SET_VERSION,
  } as unknown as ScannedRun);
  em.persist(scanned);
  await em.flush();

  /**
   * Le type d'event attendu est DÉCLARÉ par sort (`Spell.filterType`), jamais déduit.
   * `null` en base signifie `cast` — on ne précise que l'exception.
   */
  const keep = (e: (typeof events)[number]): boolean => {
    const wanted = filter.filterTypeById.get(e.abilityGameID ?? -1) ?? 'cast';
    return e.type === wanted;
  };

  /**
   * Détection des candidats : un sort du catalogue qui n'émet QUE des applybuff est
   * probablement mal déclaré. On le signale plutôt que de le deviner — c'est ainsi qu'on
   * a trouvé Void Metamorphosis.
   */
  const castSeen = new Set(events.filter((e) => e.type === 'cast').map((e) => e.abilityGameID));
  const buffOnly = [
    ...new Set(
      events
        .filter((e) => e.type === 'applybuff' && !castSeen.has(e.abilityGameID))
        .map((e) => e.abilityGameID)
        .filter((a): a is number => a != null && !filter.filterTypeById.has(a)),
    ),
  ];
  if (buffOnly.length) {
    warnings.push(`sorts sans aucun cast, à déclarer filterType='applybuff' ? ${buffOnly.join(', ')}`);
  }

  // Boss de la run + leurs events. Le trash n'est pas conservé (plan §5.6).
  let stored = 0;
  let bossCasts = 0;
  for (const b of run.bosses) {
    // Le filtre serveur reste permissif (`ability.id` seul) : c'est ici qu'on trie.
    // Joueurs et boss cohabitent dans `events` — même forme, même sémantique (un cast).
    // Ils se distinguent à la lecture : tout sourceID absent de `participants` est un boss.
    // `applybuff` est gardé en plus de `cast` : certains cooldowns ne s'incantent pas,
    // ils s'ACTIVENT — Void Metamorphosis (1217607) n'émet que des applybuff. Sans lui,
    // ces sorts sont invisibles. Le dédoublonnage se fait à la lecture (API), pas ici.
    /**
     * Un sort multi-cible produit UN event PAR CIBLE — Mana Bomb touche 3 joueurs et
     * rend 3 `cast`. Ce n'est qu'une utilisation.
     *
     * ⚠️ Ces events ne partagent pas toujours le même timestamp : on en a vu à 1 ms
     * d'écart. Un dédoublonnage sur l'instant exact laisse donc passer des doublons.
     * D'où une tolérance — largement au-dessus de l'étalement multi-cible, largement
     * en dessous du plus court cooldown réel (28 s).
     */
    const lastUse = new Map<string, number>();
    const windowEvents = events
      .filter((e) => e.timestamp >= b.startTime && e.timestamp <= b.endTime && keep(e))
      .sort((x, y) => x.timestamp - y.timestamp)
      .filter((e) => {
        const k = `${e.sourceID}|${e.abilityGameID}`;
        const prev = lastUse.get(k);
        if (prev !== undefined && e.timestamp - prev <= MULTI_TARGET_TOLERANCE_MS) return false;
        lastUse.set(k, e.timestamp);
        return true;
      });
    // Pas d'assertion `as CompactEvent` : elle masquerait un tuple incomplet.
    const inWindow: CompactEvent[] = windowEvents.map((e): CompactEvent => [
      e.timestamp,
      e.sourceID ?? 0,
      e.abilityGameID ?? 0,
      e.type === 'applybuff' ? 'applybuff' : 'cast',
    ]);
    stored += inWindow.length;
    bossCasts += windowEvents.filter(
      (e) => e.type === 'cast' && e.sourceID != null && bossSources.has(e.sourceID),
    ).length;
    em.persist(
      em.create(ScannedBoss, {
        run: em.getReference(ScannedRun, [reportCode, fight.id], { wrapped: true }),
        orderIndex: b.orderIndex,
        pullId: b.pullId,
        boss: em.getReference(Boss, b.encounterID, { wrapped: true }),
        startTime: b.startTime,
        duration: b.endTime - b.startTime,
        events: inWindow,
      } as unknown as ScannedBoss),
    );
  }

  await em.flush();

  // Au premier appel du process, `lastPointsSpent` vaut null : le solde de départ est
  // inconnu et le delta n'est pas calculable. Mieux vaut null qu'un chiffre faux.
  const after = client.lastPointsSpent;
  return {
    reportCode,
    fightID: fight.id,
    bosses: run.bosses.length,
    participants: participants.length,
    eventsStored: stored,
    eventsDropped: events.length - stored, // hors fenêtre de boss, ou type ≠ cast
    pointsSpent: before != null && after != null ? after - before : null,
    warnings: [
      ...warnings,
      `${pages} page(s) d'events, filtre de ${filter.ids.length} sorts (coût ${filter.cost.toFixed(0)})`,
      // Zéro cast de boss sur une run entière trahit une curation dont les spellId ne sont
      // pas ceux vus dans `abilityGameID` — l'API ne le dirait jamais, elle rend 0 event.
      bossCasts === 0
        ? '⚠️ aucun cast de boss — vérifier les spellId de `boss-spells.json`'
        : `${bossCasts} cast(s) de boss sur ${stored} conservés`,
    ],
  };
}
