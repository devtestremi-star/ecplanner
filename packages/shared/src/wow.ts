/**
 * Référentiel statique des classes et specs, extrait de DB2 (build 12.1.0.69382,
 * tables `ChrClasses` et `ChrSpecialization`).
 *
 * En constantes et non en base : 13 et 40 lignes immuables, dont la seule utilité est
 * l'affichage. Les stocker imposerait des jointures et des clés étrangères pour aucun
 * gain — l'identité des joueurs est portée par le JSON de la run.
 */

export interface WowClassDef {
  readonly id: number;
  readonly slug: string;
  readonly name: string;
  readonly color: string;
  /**
   * Nom de fichier Blizzard AVEC son extension, jamais une URL — même convention que
   * `Spell.icon` (`spell_deathknight_armyofthedead.jpg`).
   *
   * ⚠️ Le `.jpg` fait partie du nom : `iconUrl` se contente de le concaténer. Sans lui
   * le CDN rend un 403, pas un 404 — donc une icône muette, sans erreur exploitable.
   *
   * Écrit en dur plutôt que dérivé du slug : la règle `classicon_<slug sans tiret>` se
   * vérifie sur les 13 classes et les 3 tailles servies, mais elle n'est garantie par
   * rien. Une valeur explicite se grep et se corrige ; une règle implicite casse en
   * silence le jour où Blizzard nomme un fichier autrement.
   */
  readonly icon: string;
}
export interface WowSpecDef {
  readonly id: number;
  readonly classId: number;
  readonly slug: string;
  readonly name: string;
  readonly role: 'tank' | 'healer' | 'dps';
  /**
   * Nom de fichier Blizzard AVEC son extension, comme `WowClassDef.icon`.
   *
   * Curé à la main, spec par spec : aucune convention ne le dérive du slug — c'est
   * l'icône d'une capacité signature. Les 40 sont vérifiées en 200 sur les trois tailles
   * servies par le CDN (18, 36, 56).
   *
   * ⚠️ `.jpg` et non `.gif` : le `.gif` est l'extension des assets bruts, aucun des deux
   * CDN ne la sert (403 chez Blizzard, 404 chez Wowhead).
   *
   * ⚠️ Pas de suffixe de taille non plus : `classicon_demonhunter_void_64` rend 403 chez
   * Blizzard alors que Wowhead le sert — c'est `classicon_demonhunter_void` qu'il faut.
   */
  readonly icon: string;
}

export const WOW_CLASSES: readonly WowClassDef[] = [
  {
    "id": 1,
    "slug": "warrior",
    "name": "Warrior",
    "color": "#C69B6D",
    "icon": "classicon_warrior.jpg"
  },
  {
    "id": 2,
    "slug": "paladin",
    "name": "Paladin",
    "color": "#F48CBA",
    "icon": "classicon_paladin.jpg"
  },
  {
    "id": 3,
    "slug": "hunter",
    "name": "Hunter",
    "color": "#AAD372",
    "icon": "classicon_hunter.jpg"
  },
  {
    "id": 4,
    "slug": "rogue",
    "name": "Rogue",
    "color": "#FFF468",
    "icon": "classicon_rogue.jpg"
  },
  {
    "id": 5,
    "slug": "priest",
    "name": "Priest",
    "color": "#FFFFFF",
    "icon": "classicon_priest.jpg"
  },
  {
    "id": 6,
    "slug": "death-knight",
    "name": "Death Knight",
    "color": "#C41E3A",
    "icon": "classicon_deathknight.jpg"
  },
  {
    "id": 7,
    "slug": "shaman",
    "name": "Shaman",
    "color": "#0070DD",
    "icon": "classicon_shaman.jpg"
  },
  {
    "id": 8,
    "slug": "mage",
    "name": "Mage",
    "color": "#3FC7EB",
    "icon": "classicon_mage.jpg"
  },
  {
    "id": 9,
    "slug": "warlock",
    "name": "Warlock",
    "color": "#8788EE",
    "icon": "classicon_warlock.jpg"
  },
  {
    "id": 10,
    "slug": "monk",
    "name": "Monk",
    "color": "#00FF98",
    "icon": "classicon_monk.jpg"
  },
  {
    "id": 11,
    "slug": "druid",
    "name": "Druid",
    "color": "#FF7C0A",
    "icon": "classicon_druid.jpg"
  },
  {
    "id": 12,
    "slug": "demon-hunter",
    "name": "Demon Hunter",
    "color": "#A330C9",
    "icon": "classicon_demonhunter.jpg"
  },
  {
    "id": 13,
    "slug": "evoker",
    "name": "Evoker",
    "color": "#33937F",
    "icon": "classicon_evoker.jpg"
  }
] as const;

/** `id` = specID Blizzard, celui que renvoie `CombatantInfo.specID`. */
export const WOW_SPECS: readonly WowSpecDef[] = [
  {
    "id": 71,
    "classId": 1,
    "slug": "arms",
    "name": "Arms",
    "role": "dps",
    "icon": "ability_warrior_savageblow.jpg"
  },
  {
    "id": 72,
    "classId": 1,
    "slug": "fury",
    "name": "Fury",
    "role": "dps",
    "icon": "ability_warrior_innerrage.jpg"
  },
  {
    "id": 73,
    "classId": 1,
    "slug": "protection",
    "name": "Protection",
    "role": "tank",
    "icon": "ability_warrior_defensivestance.jpg"
  },
  {
    "id": 65,
    "classId": 2,
    "slug": "holy",
    "name": "Holy",
    "role": "healer",
    "icon": "spell_holy_holybolt.jpg"
  },
  {
    "id": 66,
    "classId": 2,
    "slug": "protection",
    "name": "Protection",
    "role": "tank",
    "icon": "ability_paladin_shieldofthetemplar.jpg"
  },
  {
    "id": 70,
    "classId": 2,
    "slug": "retribution",
    "name": "Retribution",
    "role": "dps",
    "icon": "spell_holy_auraoflight.jpg"
  },
  {
    "id": 253,
    "classId": 3,
    "slug": "beast-mastery",
    "name": "Beast Mastery",
    "role": "dps",
    "icon": "ability_hunter_bestialdiscipline.jpg"
  },
  {
    "id": 254,
    "classId": 3,
    "slug": "marksmanship",
    "name": "Marksmanship",
    "role": "dps",
    "icon": "ability_hunter_focusedaim.jpg"
  },
  {
    "id": 255,
    "classId": 3,
    "slug": "survival",
    "name": "Survival",
    "role": "dps",
    "icon": "ability_hunter_camouflage.jpg"
  },
  {
    "id": 259,
    "classId": 4,
    "slug": "assassination",
    "name": "Assassination",
    "role": "dps",
    "icon": "ability_rogue_deadlybrew.jpg"
  },
  {
    "id": 260,
    "classId": 4,
    "slug": "outlaw",
    "name": "Outlaw",
    "role": "dps",
    "icon": "inv_sword_30.jpg"
  },
  {
    "id": 261,
    "classId": 4,
    "slug": "subtlety",
    "name": "Subtlety",
    "role": "dps",
    "icon": "ability_stealth.jpg"
  },
  {
    "id": 256,
    "classId": 5,
    "slug": "discipline",
    "name": "Discipline",
    "role": "healer",
    "icon": "spell_holy_powerwordshield.jpg"
  },
  {
    "id": 257,
    "classId": 5,
    "slug": "holy",
    "name": "Holy",
    "role": "healer",
    "icon": "spell_holy_guardianspirit.jpg"
  },
  {
    "id": 258,
    "classId": 5,
    "slug": "shadow",
    "name": "Shadow",
    "role": "dps",
    "icon": "spell_shadow_shadowwordpain.jpg"
  },
  {
    "id": 250,
    "classId": 6,
    "slug": "blood",
    "name": "Blood",
    "role": "tank",
    "icon": "spell_deathknight_bloodpresence.jpg"
  },
  {
    "id": 251,
    "classId": 6,
    "slug": "frost",
    "name": "Frost",
    "role": "dps",
    "icon": "spell_deathknight_frostpresence.jpg"
  },
  {
    "id": 252,
    "classId": 6,
    "slug": "unholy",
    "name": "Unholy",
    "role": "dps",
    "icon": "spell_deathknight_unholypresence.jpg"
  },
  {
    "id": 262,
    "classId": 7,
    "slug": "elemental",
    "name": "Elemental",
    "role": "dps",
    "icon": "spell_nature_lightning.jpg"
  },
  {
    "id": 263,
    "classId": 7,
    "slug": "enhancement",
    "name": "Enhancement",
    "role": "dps",
    "icon": "spell_shaman_improvedstormstrike.jpg"
  },
  {
    "id": 264,
    "classId": 7,
    "slug": "restoration",
    "name": "Restoration",
    "role": "healer",
    "icon": "spell_nature_magicimmunity.jpg"
  },
  {
    "id": 62,
    "classId": 8,
    "slug": "arcane",
    "name": "Arcane",
    "role": "dps",
    "icon": "spell_holy_magicalsentry.jpg"
  },
  {
    "id": 63,
    "classId": 8,
    "slug": "fire",
    "name": "Fire",
    "role": "dps",
    "icon": "spell_fire_firebolt02.jpg"
  },
  {
    "id": 64,
    "classId": 8,
    "slug": "frost",
    "name": "Frost",
    "role": "dps",
    "icon": "spell_frost_frostbolt02.jpg"
  },
  {
    "id": 265,
    "classId": 9,
    "slug": "affliction",
    "name": "Affliction",
    "role": "dps",
    "icon": "spell_shadow_deathcoil.jpg"
  },
  {
    "id": 266,
    "classId": 9,
    "slug": "demonology",
    "name": "Demonology",
    "role": "dps",
    "icon": "spell_shadow_metamorphosis.jpg"
  },
  {
    "id": 267,
    "classId": 9,
    "slug": "destruction",
    "name": "Destruction",
    "role": "dps",
    "icon": "spell_shadow_rainoffire.jpg"
  },
  {
    "id": 268,
    "classId": 10,
    "slug": "brewmaster",
    "name": "Brewmaster",
    "role": "tank",
    "icon": "spell_monk_brewmaster_spec.jpg"
  },
  {
    "id": 269,
    "classId": 10,
    "slug": "windwalker",
    "name": "Windwalker",
    "role": "dps",
    "icon": "spell_monk_windwalker_spec.jpg"
  },
  {
    "id": 270,
    "classId": 10,
    "slug": "mistweaver",
    "name": "Mistweaver",
    "role": "healer",
    "icon": "spell_monk_mistweaver_spec.jpg"
  },
  {
    "id": 102,
    "classId": 11,
    "slug": "balance",
    "name": "Balance",
    "role": "dps",
    "icon": "spell_nature_starfall.jpg"
  },
  {
    "id": 103,
    "classId": 11,
    "slug": "feral",
    "name": "Feral",
    "role": "dps",
    "icon": "ability_druid_catform.jpg"
  },
  {
    "id": 104,
    "classId": 11,
    "slug": "guardian",
    "name": "Guardian",
    "role": "tank",
    "icon": "ability_racial_bearform.jpg"
  },
  {
    "id": 105,
    "classId": 11,
    "slug": "restoration",
    "name": "Restoration",
    "role": "healer",
    "icon": "spell_nature_healingtouch.jpg"
  },
  {
    "id": 577,
    "classId": 12,
    "slug": "havoc",
    "name": "Havoc",
    "role": "dps",
    "icon": "ability_demonhunter_specdps.jpg"
  },
  {
    "id": 581,
    "classId": 12,
    "slug": "vengeance",
    "name": "Vengeance",
    "role": "tank",
    "icon": "ability_demonhunter_spectank.jpg"
  },
  {
    "id": 1480,
    "classId": 12,
    "slug": "devourer",
    "name": "Devourer",
    "role": "dps",
    "icon": "classicon_demonhunter_void.jpg"
  },
  {
    "id": 1467,
    "classId": 13,
    "slug": "devastation",
    "name": "Devastation",
    "role": "dps",
    "icon": "classicon_evoker_devastation.jpg"
  },
  {
    "id": 1468,
    "classId": 13,
    "slug": "preservation",
    "name": "Preservation",
    "role": "healer",
    "icon": "classicon_evoker_preservation.jpg"
  },
  {
    "id": 1473,
    "classId": 13,
    "slug": "augmentation",
    "name": "Augmentation",
    "role": "dps",
    "icon": "classicon_evoker_augmentation.jpg"
  }
] as const;

const classById = new Map(WOW_CLASSES.map((c) => [c.id, c]));
const specById = new Map(WOW_SPECS.map((s) => [s.id, s]));
const classByName = new Map(WOW_CLASSES.map((c) => [c.name.toLowerCase().replace(/[^a-z0-9]/g, ''), c]));

export const wowClass = (id: number): WowClassDef | undefined => classById.get(id);
export const wowSpec = (id: number): WowSpecDef | undefined => specById.get(id);
/** Résout `playerDetails[].type` ("DeathKnight") vers la classe. */
export const wowClassByName = (name: string): WowClassDef | undefined =>
  classByName.get(name.toLowerCase().replace(/[^a-z0-9]/g, ''));
