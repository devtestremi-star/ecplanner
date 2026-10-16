import type { RunParticipant } from '@timeline/db';
import { wowClass, wowSpec } from '@timeline/shared';
import { resolveAnchors, type AlignableCast, type SpellFacts } from '../align.js';
import { ecpDefensive, isEcpTrinket } from './catalog.js';
import { encodePlan, toWire, type EcpPlan, type PlanUse, type RosterEntry } from './format.js';

/**
 * Construit un plan `ecp;2` à partir d'une run scannée : ce que le groupe a RÉELLEMENT
 * fait, transposé dans le vocabulaire du planificateur.
 *
 * Trois filtres se cumulent, chacun pour une raison distincte :
 *  1. l'ancrage (`resolveAnchors`) — un cast sans réponse à un sort de boss n'est pas une
 *     assignation, c'est un défensif brûlé sur du rot ;
 *  2. le catalogue ECP — un `defSpell` inconnu fait rejeter le plan ENTIER (§13), pas
 *     seulement sa ligne ;
 *  3. la cohérence classe/spé — même conséquence (§10.8, §11.3).
 */

/** Arrondi du décalage, à la seconde : la milliseconde est exacte mais illisible dans un plan. */
const OFFSET_STEP_MS = 1_000;
/**
 * Plage EXCLUSIVE ]-12 s ; 12 s[ : après arrondi, un décalage vaut au plus ±11 s. Les
 * fenêtres d'alignement (12 s) peuvent produire un écart de 11,6 s ou de 12 s pile, que
 * l'arrondi porterait à 12 : il est ramené à la borne.
 */
const OFFSET_MAX_MS = 11_000;

export interface BossWindow {
  encounterID: number;
  /** Instant du début de la fenêtre, relatif au rapport. */
  startTime: number;
  /** `[timestamp, sourceID, abilityGameID, type]`, tel que stocké. */
  events: ReadonlyArray<readonly [number, number, number, string]>;
}

export interface BuildPlanInput {
  zoneID: number;
  dungeonName: string;
  keystoneLevel: number;
  startedAt: Date;
  participants: readonly RunParticipant[];
  bosses: readonly BossWindow[];
  spells: ReadonlyMap<number, SpellFacts>;
  /** `talentTree[].id` → spellID, depuis la table `trait_entry`. */
  talentSpells: ReadonlyMap<number, readonly number[]>;
  /** Restreint l'export à un seul boss (`kind=boss`). Absent ⇒ le donjon entier. */
  onlyEncounterID?: number;
}

export class IncoherentSpecError extends Error {
  constructor(name: string, cls: string, specId: number) {
    super(`${name}: class ${cls} is incompatible with specID ${specId}`);
    this.name = 'IncoherentSpecError';
  }
}

export class NoHealerError extends Error {
  constructor() {
    super('The run has no healer - an ECP plan cannot be expressed without `h;`');
    this.name = 'NoHealerError';
  }
}

/** `Death Knight` → `DEATHKNIGHT`, le jeton attendu par le format. */
const classToken = (classId: number): string =>
  wowClass(classId)?.slug.replace(/-/g, '').toUpperCase() ?? 'UNKNOWN';

/** Nos rôles internes vers ceux du format. */
const ROLE_TOKEN: Record<string, string> = { tank: 'TANK', healer: 'HEALER', dps: 'DAMAGER' };

/**
 * Identifiant opaque du joueur. Bâti sur le `guid` WCL, seul identifiant réellement
 * global : il survit à un changement de nom ou de royaume, là où le `sourceID` est local
 * au rapport. Le format n'y cherche aucun sens, mais un id stable évite qu'un même joueur
 * change d'identité d'un export à l'autre.
 */
const playerId = (p: RunParticipant): string => `p${p.guid}`;

export function buildPlan(input: BuildPlanInput): EcpPlan {
  /**
   * Ordre du roster : par NOM, et il est contractuel (§11.2). Le `sourceID` du log est
   * local au rapport donc instable d'un scan à l'autre ; s'en servir ferait s'intervertir
   * silencieusement deux joueurs entre deux exports du même groupe.
   */
  const ordered = [...input.participants].sort((a, b) => a.name.localeCompare(b.name));

  /**
   * Le rôle vient du roster WCL ; s'il manque, la spec le donne — un joueur sans bucket
   * n'est ni tank ni soigneur, mais sa spécialisation, elle, sait ce qu'elle est.
   */
  const roleOf = (p: RunParticipant): string =>
    ROLE_TOKEN[p.role ?? wowSpec(p.specId)?.role ?? 'dps'] ?? 'DAMAGER';

  const roster: RosterEntry[] = ordered.map((p) => {
    /**
     * Liste COMPLÈTE des talents résolus, pas seulement ceux qui intéressent l'addon.
     * Le §11.1 est explicite : en envoyer trop est sans coût, en envoyer trop peu fausse
     * la résolution — certains défensifs sont définis par l'ABSENCE d'un talent.
     *
     * La MULTIPLICITÉ est porteuse de sens (§11.8) : un talent acheté à deux points est
     * émis deux fois, parce que c'est le nombre de points qui fixe le cooldown. D'où un
     * compte par spellID là où un `Set` suffisait — dédupliquer ferait passer tous les
     * talents pour des talents à un point, et ce silencieusement.
     *
     * Rangs pris au MAXIMUM, jamais sommés : `rank` qualifie un nœud d'arbre, et un même
     * sort peut être visé par deux nœuds distincts (`trait_entry` est une clé composite —
     * un talent en accorde un et en affiche un autre). Les additionner inventerait des
     * points que le joueur n'a pas achetés.
     */
    const points = new Map<number, number>();
    for (const t of p.talentTree ?? []) {
      // Un nœud présent vaut au moins un point : un `rank` absent ou nul serait une
      // anomalie de la source, pas un talent à zéro point.
      const rank = t.rank >= 1 ? t.rank : 1;
      for (const s of input.talentSpells.get(t.id) ?? []) {
        points.set(s, Math.max(points.get(s) ?? 0, rank));
      }
    }
    /**
     * Incohérence classe/specID : l'addon la refuse plutôt que de trancher en silence.
     * Autant l'attraper ici, où l'on sait encore de quel joueur il s'agit.
     */
    const spec = wowSpec(p.specId);
    if (spec && spec.classId !== p.classId) {
      throw new IncoherentSpecError(p.name, classToken(p.classId), p.specId);
    }
    /**
     * Trinkets DÉCLARÉS : seulement ceux que l'addon sait résoudre (§11.9). Les autres
     * sont ignorés à l'import, les émettre ne ferait qu'allonger la ligne.
     *
     * `null` — run scannée avant la capture de l'équipement, ou joueur sans
     * CombatantInfo — donne un champ omis, donc exactement l'ancien comportement.
     */
    const items = (p.trinkets ?? []).filter(isEcpTrinket);
    return {
      id: playerId(p),
      role: roleOf(p),
      class: classToken(p.classId),
      ...(spec ? { specID: p.specId } : {}),
      spec: spec?.name ?? '',
      // Répétitions contiguës et ordre stable : deux exports du même plan restent
      // comparables octet pour octet.
      talents: [...points]
        .sort(([a], [b]) => a - b)
        .flatMap(([spell, n]) => Array.from({ length: n }, () => spell)),
      ...(items.length > 0 ? { items } : {}),
    };
  });

  // MÊME résolution que celle émise dans `r;` : sinon un joueur sorti `HEALER` dans le
  // roster pourrait ne pas être trouvé ici, et l'export échouerait sur un plan valide.
  const healer = ordered.find((p) => roleOf(p) === 'HEALER');
  if (!healer) throw new NoHealerError();

  const byName = new Map(ordered.map((p) => [p.sourceID, p]));
  const specName = new Map(ordered.map((p) => [p.sourceID, wowSpec(p.specId)?.name ?? '']));
  const roleBySource = new Map(input.participants.map((p) => [p.sourceID, p.role]));
  const specBySource = new Map(input.participants.map((p) => [p.sourceID, p.specId]));

  const windows = input.onlyEncounterID === undefined
    ? input.bosses
    : input.bosses.filter((b) => b.encounterID === input.onlyEncounterID);

  const uses: PlanUse[] = [];
  for (const b of windows) {
    const casts: AlignableCast[] = b.events.map(([ts, src, ability]) => ({
      offsetBoss: ts - b.startTime,
      sourceID: src,
      abilityGameID: ability,
    }));
    const anchors = resolveAnchors(casts, { roleBySource, specBySource, spells: input.spells });

    casts.forEach((c, i) => {
      const a = anchors[i];
      if (!a) return; // pas d'ancre ⇒ aucune intention à transcrire

      // Le catalogue de l'addon, pas le nôtre : un defSpell inconnu fait tout rejeter.
      const def = ecpDefensive(c.abilityGameID);
      if (!def) return;

      const p = byName.get(c.sourceID);
      if (!p) return;
      // Un défensif attribué à la mauvaise classe est un rejet global (§10.8).
      if (def.classToken && classToken(p.classId) !== def.classToken) return;
      /**
       * Défensif d'objet : la seule preuve qu'il est disponible est le trinket déclaré
       * dans `items`. Émettre la ligne `u;` sans lui ferait rejeter le plan entier avec
       * « does not declare … as equipped » — et le cast est bien réel, c'est notre
       * capture de l'équipement qui manque (run scannée avant le champ `trinkets`).
       */
      if (def.requiresItem !== undefined && !(p.trinkets ?? []).includes(def.requiresItem)) return;
      // Certains sont verrouillés par spé, sans aucun talent pour le dire (§11.3).
      if (def.requiresSpec && specName.get(c.sourceID) !== def.requiresSpec) return;
      /**
       * Un CD de soin n'appartient qu'au joueur désigné par `h;` (§14.3). Sans ce test,
       * l'Avenging Wrath d'un paladin Vindicte partirait comme cooldown de soigneur —
       * l'addon le résoudrait pour le `h;` et rejetterait le plan EN BLOC (§10.8).
       */
      if (def.healerOnly && p.sourceID !== healer.sourceID) return;

      /**
       * Décalage relatif à la FIN d'incantation de la capacité de boss — confirmé côté
       * addon. Les deux instants viennent d'events `cast` (SPELL_CAST_SUCCESS), donc le
       * calcul est direct et il n'y a RIEN à compenser.
       *
       * ⚠️ Ne pas « corriger » en soustrayant une durée d'incantation : ce serait juste si
       * la référence était le début du sort, elle ne l'est pas. Négatif = le joueur a
       * anticipé, positif = il a réagi après.
       */
      const raw = c.offsetBoss - a.offsetBoss;
      const offsetMs = Math.max(
        -OFFSET_MAX_MS,
        Math.min(OFFSET_MAX_MS, Math.round(raw / OFFSET_STEP_MS) * OFFSET_STEP_MS),
      );
      uses.push({
        encID: b.encounterID,
        bossSpell: a.spellId,
        n: a.occurrence,
        id: playerId(p),
        defSpell: def.spellId,
        ...(offsetMs !== 0 ? { offsetMs } : {}),
      });
    });
  }

  const date = input.startedAt.toISOString().slice(0, 10);
  const single = input.onlyEncounterID !== undefined;
  return {
    kind: single ? 'boss' : 'variant',
    ...(single ? { encID: input.onlyEncounterID } : { zoneID: input.zoneID }),
    title: `${input.dungeonName} +${input.keystoneLevel} - ${date}`,
    roster,
    healer: playerId(healer),
    uses,
  };
}

/** Document `ecp;2` nu — lisible, diffable, utile au diagnostic. */
export const buildPlanText = (input: BuildPlanInput): string => encodePlan(buildPlan(input));

/** Enveloppe `ecp64:` — la forme à coller dans l'addon (§5bis). */
export const buildPlanWire = (input: BuildPlanInput): string => toWire(buildPlanText(input));
