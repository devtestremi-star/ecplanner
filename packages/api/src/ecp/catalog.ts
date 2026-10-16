/**
 * Catalogue des défensifs reconnus par l'addon — PLAN_FORMAT_V2 §14.3.
 *
 * Ce sont les SEULES valeurs acceptées pour `defSpell`. Tout autre spellID fait rejeter
 * le plan entier (§13, « `defSpell` absent du catalogue »), et non pas seulement la ligne :
 * sans ce filtre, un export contenant un défensif personnel — Obsidian Scales, Blur — est
 * refusé en bloc. Mesuré sur la run témoin : 15 casts alignés sur 22 sont hors catalogue.
 *
 * ECP ne planifie que des cooldowns de GROUPE : externals et CD de soin. Les défensifs
 * personnels relèvent de l'appel générique « Defensive », que le format ne transporte pas.
 *
 * La classe sert à écarter en amont une incohérence lanceur/sort, qui serait elle aussi
 * un rejet global (§10.8).
 */
export interface EcpDefensive {
  spellId: number;
  name: string;
  /**
   * Jeton de classe, tel qu'émis dans `r;`. Absent pour un défensif d'OBJET : un trinket
   * n'appartient à aucune classe, c'est `requiresItem` qui le conditionne (§11.9).
   */
  classToken?: string;
  /**
   * itemID du trinket qui accorde ce sort. Le lanceur doit le déclarer dans le champ
   * `items` de sa ligne `r;`, sans quoi l'addon refuse le plan ENTIER — la résolution ne
   * passe alors ni par les talents ni par la spé, seulement par l'équipement.
   */
  requiresItem?: number;
  /** Réservé à cette spé, quand aucun talent ne le conditionne (§11.3). */
  requiresSpec?: string;
  /**
   * CD de soin : fourni par le joueur désigné par `h;`, jamais par un autre (§14.3).
   *
   * Sans ce drapeau, l'Avenging Wrath d'un paladin Vindicte ou la Convoke d'un druide
   * Équilibre partent comme des cooldowns de soigneur — l'addon les résout alors pour le
   * `h;`, et le plan est rejeté EN BLOC. Zephyr en est absent à dessein : il est external
   * chez un Évocateur DPS et CD de soin en Préservation (§11.4).
   */
  healerOnly?: boolean;
}

export const ECP_DEFENSIVES: readonly EcpDefensive[] = [
  // --- externals, fournis par les non-soigneurs ---------------------------
  { spellId: 51052, name: 'Anti-Magic Zone', classToken: 'DEATHKNIGHT' },
  { spellId: 196718, name: 'Darkness', classToken: 'DEMONHUNTER' },
  { spellId: 374227, name: 'Zephyr', classToken: 'EVOKER' },
  { spellId: 15286, name: 'Vampiric Embrace', classToken: 'PRIEST', requiresSpec: 'Shadow' },
  { spellId: 97462, name: 'Rallying Cry', classToken: 'WARRIOR' },
  // --- CD de soin ---------------------------------------------------------
  { spellId: 740, name: 'Tranquility', classToken: 'DRUID', healerOnly: true },
  { spellId: 391528, name: 'Convoke the Spirits', classToken: 'DRUID', healerOnly: true },
  { spellId: 33891, name: 'Incarnation: Tree of Life', classToken: 'DRUID', healerOnly: true },
  { spellId: 132158, name: "Nature's Swiftness", classToken: 'DRUID', healerOnly: true },
  { spellId: 359816, name: 'Dream Flight', classToken: 'EVOKER', healerOnly: true },
  { spellId: 370537, name: 'Stasis', classToken: 'EVOKER', healerOnly: true },
  { spellId: 363534, name: 'Rewind', classToken: 'EVOKER', healerOnly: true },
  { spellId: 115310, name: 'Revival', classToken: 'MONK', healerOnly: true },
  { spellId: 388615, name: 'Restoral', classToken: 'MONK', healerOnly: true },
  { spellId: 443028, name: 'Celestial Conduit', classToken: 'MONK', healerOnly: true },
  { spellId: 322118, name: "Invoke Yu'lon", classToken: 'MONK', healerOnly: true },
  { spellId: 325197, name: 'Invoke Chi-Ji', classToken: 'MONK', healerOnly: true },
  { spellId: 31821, name: 'Aura Mastery', classToken: 'PALADIN', healerOnly: true },
  { spellId: 31884, name: 'Avenging Wrath', classToken: 'PALADIN', healerOnly: true },
  { spellId: 216331, name: 'Avenging Crusader', classToken: 'PALADIN', healerOnly: true },
  { spellId: 375576, name: 'Divine Toll', classToken: 'PALADIN', healerOnly: true },
  { spellId: 114165, name: 'Holy Prism', classToken: 'PALADIN', healerOnly: true },
  { spellId: 200025, name: 'Beacon of Virtue', classToken: 'PALADIN', healerOnly: true },
  { spellId: 64843, name: 'Divine Hymn', classToken: 'PRIEST', healerOnly: true, requiresSpec: 'Holy' },
  { spellId: 200183, name: 'Apotheosis', classToken: 'PRIEST', healerOnly: true, requiresSpec: 'Holy' },
  { spellId: 47788, name: 'Guardian Spirit', classToken: 'PRIEST', healerOnly: true, requiresSpec: 'Holy' },
  { spellId: 472433, name: 'Evangelism', classToken: 'PRIEST', healerOnly: true, requiresSpec: 'Discipline' },
  // 421453 = le sort CASTÉ (abilityGameID du log, et `defSpell` attendu au §14.3). L'addon le
  // range sous une clé interne héritée 421543 : c'est SON affaire, jamais la nôtre.
  { spellId: 421453, name: 'Ultimate Penitence', classToken: 'PRIEST', healerOnly: true, requiresSpec: 'Discipline' },
  { spellId: 62618, name: 'Power Word: Barrier', classToken: 'PRIEST', healerOnly: true, requiresSpec: 'Discipline' },
  { spellId: 98008, name: 'Spirit Link Totem', classToken: 'SHAMAN', healerOnly: true },
  { spellId: 114052, name: 'Ascendance', classToken: 'SHAMAN', healerOnly: true },
  { spellId: 108280, name: 'Healing Tide Totem', classToken: 'SHAMAN', healerOnly: true },
  { spellId: 378081, name: "Nature's Swiftness", classToken: 'SHAMAN', healerOnly: true },
  { spellId: 443454, name: 'Ancestral Swiftness', classToken: 'SHAMAN', healerOnly: true },
  // Comme Zephyr : external chez un chaman DPS, CD de soin chez le Resto désigné (§11.4) —
  // donc sans `healerOnly`. Talent de classe au même spellID que le sort.
  { spellId: 383013, name: 'Poison Cleansing Totem', classToken: 'SHAMAN' },
  // --- défensifs d'objet (§11.9) -----------------------------------------
  // Aucun trinket external à ce jour : l'addon ne sait les placer que pour le `h;`.
  { spellId: 1291894, name: 'Soulcoiler Ritual Vessel', requiresItem: 270162, healerOnly: true },
];

const byId = new Map(ECP_DEFENSIVES.map((d) => [d.spellId, d]));
export const ecpDefensive = (spellId: number): EcpDefensive | undefined => byId.get(spellId);

/**
 * itemID des trinkets que l'addon sait résoudre — les SEULS à émettre dans `items`.
 *
 * Un trinket inconnu n'est pas une erreur, il est ignoré (§11.9) ; mais l'émettre
 * alourdirait chaque ligne `r;` de deux objets sur trois sans rien apporter.
 */
const TRINKET_ITEMS: ReadonlySet<number> = new Set(
  ECP_DEFENSIVES.map((d) => d.requiresItem).filter((i): i is number => i !== undefined),
);

export const isEcpTrinket = (itemId: number): boolean => TRINKET_ITEMS.has(itemId);
