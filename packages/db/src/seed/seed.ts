/**
 * Seed du référentiel.
 *
 * Trois origines, aucune inventée :
 *  - `data/classes.json`, `data/specs.json` — extraits de DB2 (wago.tools, build 12.1.0.69382),
 *    tables `ChrClasses` et `ChrSpecialization`. Les specID sont ceux de Blizzard, donc ceux
 *    que renvoie `CombatantInfo.specID`.
 *  - `data/spells.json` — union de la relecture manuelle et de wow_defensives, cette dernière
 *    prioritaire en cas de conflit.
 *  - `data/boss-spells.json` — curation manuelle des sorts de boss, par boss. Tout ce qui
 *    y est listé entre en base et donc dans le filtre de scan. `inTimeline` ne filtre ni
 *    la collecte ni l'affichage, mais il DÉCIDE de l'ancrage : seul un sort à `true` sert
 *    de point de recalage aux réponses des joueurs et devient une cible valide à l'export
 *    ECP. Le passer à `false` retire silencieusement le sort de tous les plans.
 *  - `data/trait-entries.json` — extrait DB2 (wago.tools, même build que classes/specs).
 *    Correspondance nœud d'arbre → sort, seule voie pour obtenir les talents d'un joueur :
 *    WCL ne rend que des identifiants de nœuds.
 *  - noms, icônes et donjons — récupérés à l'exécution via l'API WCL.
 *
 * Idempotent : relançable sans effet de bord.
 */
import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MikroORM } from '@mikro-orm/postgresql';
import { WclClient, buildAbilityLookup, WORLD_ZONE } from '@timeline/wcl';
import config from '../mikro-orm.config.js';
import { Boss, Dungeon, DungeonSeason, Season, Spell, SpellCategory, SpellSpec, TraitEntry } from '../entities/index.js';

const DATA = join(dirname(fileURLToPath(import.meta.url)), 'data');
const read = async <T>(f: string): Promise<T> => JSON.parse(await readFile(join(DATA, f), 'utf8')) as T;

interface SpellRow {
  spellId: number; name: string; classId: number | null;
  category: string | null; baseCooldownSec: number | null;
  specIds: number[]; origin: string;
  /** Type d'event WCL attendu. Absent ou null = `cast`. */
  filterType?: string | null;
  /** Justification d'un ajout manuel — pourquoi ce sort ne vient pas des CSV. */
  note?: string;
}

/** Un boss et ses sorts, tels que curés à la main. */
interface BossRow {
  encounterID: number;
  name: string;
  /** Nom de donjon tel qu'écrit dans la curation — résolu par comparaison normalisée. */
  dungeon: string;
  patch: string;
  spells: Array<{
    spellId: number;
    name: string;
    /** Type d'event WCL attendu. Absent = `cast`. Voir `Spell.filterType`. */
    filterType?: string | null;
    /** Annotation de curation, transmise jusqu'au front. Ne filtre rien. */
    inTimeline?: boolean;
  }>;
}

/**
 * Zones M+ à seeder. 47 = Season 1, 55 = Season 2.
 *
 * Les DEUX, et non plus une seule : la curation des sorts de boss couvre les donjons des
 * deux saisons, et un boss sans son donjon ne peut pas être créé (clé étrangère).
 */
const SEASON_ZONE_IDS = (process.env.SEED_ZONE_IDS ?? '47,55').split(',').map(Number);
/** La seule saison marquée active — celle que le scan considère par défaut. */
const ACTIVE_ZONE_ID = Number(process.env.SEED_ACTIVE_ZONE_ID ?? 55);

/** Comparaison de noms tolérante aux apostrophes : « Magister's » vs « Magisters' ». */
const normName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const slug = (s: string): string =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const orm = await MikroORM.init(config);
const em = orm.em.fork();

const clientId = process.env.WCL_CLIENT_ID;
const clientSecret = process.env.WCL_CLIENT_SECRET;
if (!clientId || !clientSecret) throw new Error('WCL_CLIENT_ID / WCL_CLIENT_SECRET absents');
const wcl = new WclClient({ credentials: { clientId, clientSecret } });

// Classes et specs ne sont plus en base : elles vivent en constantes dans
// `@timeline/shared`. Le seed ne porte plus que ce qui est interrogé.

// --- 1. Saisons et donjons, depuis worldData ------------------------------

/**
 * ⚠️ L'`encounterID` d'un donjon est SAISONNIER — Ruby Life Pools vaut 12521, 62521 puis
 * 112521 selon la saison. L'identité stable est `gameZone.id`, mais `worldData` ne le donne
 * pas : son suffixe est le gameZoneId. On le dérive, et le scan corrigera au premier passage
 * avec la vraie valeur de `fight.gameZone.id`.
 */
const gameZoneIdFrom = (encounterID: number): number => Number(String(encounterID).slice(-4));

/** `dID` du format d'échange ECP, curé à la main : le jeton n'est pas dérivable du nom. */
const ecpDungeons = await read<Record<string, string>>('ecp-dungeons.json');
const missingEcp: string[] = [];

let dungeonCount = 0;
for (const zoneId of SEASON_ZONE_IDS) {
  const zoneRes = await wcl.query<{
    worldData: { zone: { id: number; name: string; expansion: { id: number } | null; encounters: Array<{ id: number; name: string }> } | null };
  }>(WORLD_ZONE, { id: zoneId });
  const zone = zoneRes.data.worldData.zone;
  if (!zone) throw new Error(`Zone ${zoneId} introuvable`);

  let season = await em.findOne(Season, { zoneId: zone.id });
  if (!season) season = em.create(Season, {} as Season);
  season.zoneId = zone.id;
  season.name = zone.name;
  season.expansionId = zone.expansion?.id ?? 0;
  season.active = zone.id === ACTIVE_ZONE_ID;
  await em.persistAndFlush(season);

  for (const enc of zone.encounters) {
    const gz = gameZoneIdFrom(enc.id);
    let d = await em.findOne(Dungeon, { gameZoneId: gz });
    if (!d) d = em.create(Dungeon, { gameZoneId: gz, slug: slug(enc.name), name: enc.name } as Dungeon);
    d.name = enc.name; d.slug = slug(enc.name);
    // `dID` du format ECP. Absent de la table ⇒ laissé vide : le donjon existe quand même,
    // il ne pourra simplement pas être exporté vers l'addon.
    const ecpId = ecpDungeons[enc.name];
    if (ecpId) d.ecpId = ecpId;
    else missingEcp.push(enc.name);
    em.persist(d);
    await em.flush();

    const existing = await em.findOne(DungeonSeason, { dungeon: d, season });
    if (!existing) {
      em.persist(em.create(DungeonSeason, {
        dungeon: em.getReference(Dungeon, gz, { wrapped: true }),
        season: em.getReference(Season, season.id, { wrapped: true }),
        encounterID: enc.id,
      } as unknown as DungeonSeason));
    }
    dungeonCount++;
  }
  await em.flush();
  console.log(`✅ Season    : ${zone.name} (zone ${zone.id})${season.active ? ' — ACTIVE' : ''}, ${zone.encounters.length} donjons`);
}
console.log(`✅ Dungeon   : ${dungeonCount} couples donjon × saison`);
console.log(`✅ ECP dID   : ${dungeonCount - missingEcp.length}/${dungeonCount}${missingEcp.length ? ` — sans dID : ${missingEcp.join(', ')}` : ''}`);


// --- 2. Sorts : noms et icônes depuis gameData.ability --------------------
// `spells.json` est régénéré depuis les CSV ; `spells-manual.json` ne l'est jamais.
// Séparer les deux évite qu'un ajout à la main disparaisse à la prochaine régénération.
const generated = await read<SpellRow[]>('spells.json');
const manual = await read<SpellRow[]>('spells-manual.json');
const bySpellId = new Map(generated.map((s) => [s.spellId, s]));
for (const m of manual) bySpellId.set(m.spellId, m); // l'ajout manuel fait foi
const spells = [...bySpellId.values()].sort((a, b) => a.spellId - b.spellId);
console.log(`   ${generated.length} sorts générés + ${manual.length} manuel(s) = ${spells.length}`);

// Un seul lookup pour les deux familles : `gameData.ability` répond aussi bien sur un sort
// de boss que sur un sort joueur (vérifié), et le coût se paie par lot de 200, pas à l'unité.
const bossRows = await read<BossRow[]>('boss-spells.json');
// Seuls les sorts retenus par la curation sont persistés — inutile d'aller chercher
// nom et icône des autres, ni de les compter dans la réconciliation.
const bossSpellIds = bossRows.flatMap((b) => b.spells.map((sp) => sp.spellId));
const ids = [...spells.map((s) => s.spellId), ...bossSpellIds];
const meta = new Map<number, { name: string | null; icon: string | null }>();
const BATCH = 200; // ~1 point par lot (NOTES E14)
for (let i = 0; i < ids.length; i += BATCH) {
  const chunk = ids.slice(i, i + BATCH);
  const res = await wcl.query<Record<string, { ability: { id: number; name: string | null; icon: string | null } | null }>>(
    buildAbilityLookup(chunk),
  );
  for (const [k, v] of Object.entries(res.data)) {
    if (k === 'rateLimitData' || !v?.ability) continue;
    meta.set(v.ability.id, { name: v.ability.name, icon: v.ability.icon });
  }
  console.log(`   lookup ${i + chunk.length}/${ids.length} — coût ${res.cost ?? '?'}`);
}

let missingIcon = 0;
for (const s of spells) {
  const m = meta.get(s.spellId);
  if (!m?.icon) missingIcon++;
  let e = await em.findOne(Spell, { spellId: s.spellId });
  if (!e) e = em.create(Spell, { spellId: s.spellId, name: s.name } as Spell);
  // La curation locale fait foi sur le nom si l'API n'a rien.
  e.name = m?.name ?? s.name;
  if (m?.icon) e.icon = m.icon;
  if (s.category) e.category = s.category as SpellCategory;
  e.filterType = s.filterType ?? undefined;
  if (s.baseCooldownSec) e.baseCooldownSec = s.baseCooldownSec;
  em.persist(e);
}
await em.flush();
console.log(`✅ Spell     : ${spells.length}  (${missingIcon} sans icône)`);

// --- 3. Pivot sort ↔ spec -------------------------------------------------
/**
 * `spec-overrides.json` porte deux corrections issues de la relecture humaine :
 *  - `removes` : liens spec erronés. Le rattachement « toutes les specs de la classe »,
 *    faute de mieux au moment du seed initial, a produit 74 liens faux — Spirit Link Totem
 *    n'appartient qu'à Restauration, Ardent Defender qu'à Protection.
 *  - `overrides` : un même sort ne joue pas le même rôle selon la spec. Divine Toll soigne
 *    en Holy et frappe ailleurs.
 */
interface SpecOverrides {
  removes: Array<{ spellId: number; specId: number }>;
  overrides: Array<{ spellId: number; specId: number; category: string; note?: string }>;
}
const specOverrides = await read<SpecOverrides>('spec-overrides.json');
const removedLinks = new Set(specOverrides.removes.map((r) => `${r.spellId}|${r.specId}`));
const linkCategory = new Map(
  specOverrides.overrides.map((o) => [`${o.spellId}|${o.specId}`, o.category as SpellCategory]),
);
// Réconciliation dans les deux sens : un rattachement qui se resserre doit perdre
// ses liens devenus faux, pas seulement gagner les nouveaux.
let added = 0;
let dropped = 0;
for (const s of spells) {
  const want = new Set(s.specIds.filter((specId) => !removedLinks.has(`${s.spellId}|${specId}`)));
  const current = await em.find(SpellSpec, { spell: s.spellId });
  for (const link of current) {
    if (want.has(link.specId)) {
      want.delete(link.specId);
      // Réappliqué à chaque seed : la requalification suit la curation, pas la base.
      link.category = linkCategory.get(`${s.spellId}|${link.specId}`);
    } else {
      em.remove(link);
      dropped++;
    }
  }
  for (const specId of want) {
    em.persist(em.create(SpellSpec, {
      spell: em.getReference(Spell, s.spellId, { wrapped: true }),
      specId,
      category: linkCategory.get(`${s.spellId}|${specId}`),
    } as unknown as SpellSpec));
    added++;
  }
}
await em.flush();
console.log(`✅ SpellSpec : +${added} / -${dropped}`);

// --- 4. Réconciliation : retirer ce qui a quitté la liste ------------------
// Le seed est la source de vérité pour les sorts JOUEURS. Les sorts de boss sont
// upsertés par le scan et ne doivent jamais être emportés ici.
const seeded = new Set(spells.map((s) => s.spellId));
const stale = (await em.find(Spell, { boss: null })).filter((e) => !seeded.has(e.spellId));
if (stale.length) {
  await em.nativeDelete(SpellSpec, { spell: { $in: stale.map((e) => e.spellId) } });
  await em.nativeDelete(Spell, { spellId: { $in: stale.map((e) => e.spellId) } });
  console.log(`🗑  Retirés   : ${stale.length} sorts sortis de la liste`);
} else {
  console.log(`🗑  Retirés   : 0`);
}

// --- 5. Boss et leurs sorts -----------------------------------------------
// Les boss ne sont résolubles nulle part dans `worldData` (NOTES E2/E14) : cette curation
// est leur seule source tant qu'aucun scan ne les a découverts.
const dungeonsByName = new Map((await em.find(Dungeon, {})).map((d) => [normName(d.name), d]));

let bossCreated = 0;
let bossSpellCount = 0;
const skipped: string[] = [];
const diverging: string[] = [];

for (const row of bossRows) {
  const dungeon = dungeonsByName.get(normName(row.dungeon));
  if (!dungeon) {
    // Sans son donjon, la clé étrangère de `Boss` ne peut pas être satisfaite.
    skipped.push(`${row.name} (${row.dungeon})`);
    continue;
  }

  let boss = await em.findOne(Boss, { encounterID: row.encounterID });
  if (!boss) {
    // `npcGameId` reste vide : il vient de `masterData`, le scan le remplira.
    boss = em.create(Boss, {
      encounterID: row.encounterID,
      dungeon: em.getReference(Dungeon, dungeon.gameZoneId, { wrapped: true }),
      slug: slug(row.name),
      name: row.name,
    } as unknown as Boss);
    em.persist(boss);
    bossCreated++;
  } else if (normName(boss.name) !== normName(row.name)) {
    // Le nom en base vient de `gameData.npc`, canonique : la curation ne l'écrase pas.
    diverging.push(`${row.encounterID} : base "${boss.name}" vs curation "${row.name}"`);
  }
  await em.flush();

  for (const sp of row.spells) {
    // Aucun verrou sur la COLLECTE : tout ce qui est listé est scanné et affiché.
    // `inTimeline`, lui, décide de l'ancrage et de l'export ECP (cf. `Spell.inTimeline`).
    // La réconciliation du §6 retire ce qui sort de la curation.
    const m = meta.get(sp.spellId);
    let e = await em.findOne(Spell, { spellId: sp.spellId });
    if (!e) e = em.create(Spell, { spellId: sp.spellId, name: sp.name } as Spell);
    e.name = m?.name ?? sp.name;
    if (m?.icon) e.icon = m.icon;
    e.category = SpellCategory.BOSS;
    e.boss = em.getReference(Boss, row.encounterID, { wrapped: true });
    // Un sort de boss aussi peut n'exister qu'en `applybuff` — même mécanique que côté joueur.
    e.filterType = sp.filterType ?? undefined;
    e.inTimeline = sp.inTimeline ?? true;
    em.persist(e);
    bossSpellCount++;
  }
  await em.flush();
}
console.log(`✅ Boss      : +${bossCreated} créés, ${skipped.length} ignorés`);
console.log(`✅ BossSpell : ${bossSpellCount} sorts (toute la curation entre dans le filtre de scan)`);
for (const d of diverging) console.log(`   ⚠️  ${d}`);
if (skipped.length) console.log(`   ⚠️  donjon inconnu : ${skipped.join(', ')}`);

// --- 6. Réconciliation des sorts de boss -----------------------------------
// Symétrique du §4. Sans elle, un sort retiré de la curation resterait dans le filtre
// de scan indéfiniment.
const curated = new Set(bossSpellIds);
const staleBoss = (await em.find(Spell, { boss: { $ne: null } })).filter((e) => !curated.has(e.spellId));
if (staleBoss.length) {
  await em.nativeDelete(Spell, { spellId: { $in: staleBoss.map((e) => e.spellId) } });
}
console.log(`🗑  Boss ret. : ${staleBoss.length} sorts sortis de la curation`);

// --- 7. Talents : nœud d'arbre → sort ---------------------------------------
/**
 * Sans cette table, aucun export ECP n'est possible : WCL ne donne que des identifiants
 * de nœuds (`talentTree[].id`), jamais de spellID, et son champ `talents` est vide.
 *
 * Remplacement en bloc plutôt que réconciliation ligne à ligne : c'est un extrait DB2
 * figé sur une version de client, pas une curation. Un nœud disparu au patch suivant doit
 * disparaître, pas survivre.
 */
interface TraitFile { build: string; entries: Record<string, number[]> }
const traits = await read<TraitFile>('trait-entries.json');
const traitRows = Object.entries(traits.entries).flatMap(([node, spells]) =>
  spells.map((spellId) => ({ nodeEntryId: Number(node), spellId })),
);
await em.nativeDelete(TraitEntry, {});
// Insertion en masse : 9464 lignes une par une prendraient des minutes.
const TRAIT_CHUNK = 2000;
for (let i = 0; i < traitRows.length; i += TRAIT_CHUNK) {
  await em.insertMany(TraitEntry, traitRows.slice(i, i + TRAIT_CHUNK));
}
console.log(`✅ TraitEntry: ${traitRows.length} liens (build ${traits.build}), ${Object.keys(traits.entries).length} nœuds`);

console.log(`\nPoints WCL consommés : ~${Math.ceil(ids.length / BATCH) + SEASON_ZONE_IDS.length}`);
await orm.close();
