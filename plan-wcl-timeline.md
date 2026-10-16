# Plan de projet — Analyseur de timeline Mythic+ via Warcraft Logs

## 0. Comment lire ce document

Ce plan distingue systématiquement **ce qui est confirmé par la documentation WCL** de **ce qui doit être vérifié empiriquement avant d'écrire du code**. Cette distinction n'est pas cosmétique : l'API v2 renvoie du JSON opaque (scalaire `JSON`, non typé par le schéma GraphQL), donc aucun outillage ne protège d'une erreur d'interprétation de la structure.

**Règle absolue : ne jamais figer un accès à un champ d'un blob JSON sans avoir dumpé une réponse réelle au préalable.**

> **État au 2026-08-17 — Phase 0 terminée.** Ce document a été révisé sur la base de mesures
> réelles. Les constats, dumps et écarts sont dans `recon/NOTES.md` (référencés ici sous la
> forme E1…E13) ; le harnais de mesure jetable est dans `recon/`.
>
> Ce qui reste hypothétique est marqué ⏳ et listé en §6 / §8. Tout le reste est mesuré.

---

## 1. Objectif fonctionnel

Un outil web qui, à partir d'un lien Warcraft Logs vers une run Mythic+, produit une **timeline visuelle** des sorts importants (cooldowns longs, ≥ 30 s) lancés par les 5 membres du groupe, boss par boss.

Sortie attendue, par combat de boss :

```
Boss "Nom du boss" (encounterID 12345)
  ├─ Joueur A (Restoration Druid) — SPELL X à 12.4s, SPELL Y à 87.1s
  ├─ Joueur B (Blood DK)          — SPELL Z à 5.2s
  └─ ...
```

**Mode d'alimentation unique : on-demand.** Un utilisateur colle une URL WCL, le scan se déclenche en direct. Il n'y a pas de scan batch des classements — cette option est écartée.

Une recherche interne permet de retrouver les runs déjà scannées, ce qui incite à la réutilisation du cache.

⚠️ **Conséquence assumée** : le corpus démarre vide et se remplit uniquement au rythme des soumissions. Il n'est pas un échantillon représentatif du haut du ladder mais un échantillon de ce qui circule (logs partagés, streamers, gens vérifiant leur propre run). Toute statistique agrégée produite à partir de ce corpus doit être présentée avec cette réserve.

---

## 2. Contraintes API — état de la validation

### 2.1 Confirmé par la documentation

| Élément | Fait établi |
|---|---|
| Endpoint public | `https://www.warcraftlogs.com/api/v2/client`, OAuth client credentials |
| Endpoint privé | `https://www.warcraftlogs.com/api/v2/user`, OAuth authorization code — **seul accès aux rapports privés**. ❌ Hors périmètre : on reste sur client credentials (§4.6) |
| Rate limit | Budget **en points par heure**, pas en requêtes. Valeur usuelle 3 600, à lire dynamiquement |
| Monitoring | `rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }`, appendable à n'importe quelle query |
| Zone | `worldData.zone(id:)` expose `encounters { id name }` et `frozen` |
| Référentiel global | `gameData` expose `ability(id)`, `classes`, `npc(id)`, `zone(id)` — lookups **hors rapport**, sur lesquels repose tout le seed (§5.1, §5.2) |
| Filtres avancés | La syntaxe des chaînes de filtre est **identique à celle du site** |
| Usage commercial | Approbation préalable requise (pub, abonnements, revente de données) |

### 2.2 ✅ Tranché en Phase 0

Les six hypothèses ont été vérifiées sur dumps réels. Détail et payloads dans
`recon/NOTES.md`.

| # | Point | Constat |
|---|---|---|
| 1 | `report.playerDetails` | Structure **doublement imbriquée** : `{ data: { playerDetails: { tanks, healers, dps } } }`. Champs : `name, id, guid, type, server, region, icon, specs, minItemLevel, maxItemLevel, potionUse, healthstoneUse`. `specs` = `[{spec, count}]`, pas `[string]`. Exige `fightIDs` ou une fenêtre temporelle. |
| 2 | Event `cast` | Exactement `{ timestamp, type, sourceID, targetID, abilityGameID, fight }`. Le champ `fight` **est présent**. |
| 3 | `filterExpression` | Fonctionne. `type = "cast"` et `type = 'cast'` indifféremment ; `ability.id in (…)` exact ; `in` marche aussi sur les chaînes. |
| 4 | Talents | `talents` est un **tableau vide** (champ mort). Le vrai contenu est `talentTree : [{ id, rank, nodeID }]`. `specID` numérique disponible au passage. |
| 5 | Budget sous token utilisateur | **Sans objet** : à ~4 points par scan sur 3600/h, le budget n'est pas contraignant. Le flow authorization code ne sert plus qu'aux rapports privés. |
| 6 | Longueur du filtre | Borne nette : `Σ (chiffres(id) + 4,23) ≲ 7215`, soit **~640 ids à 7 chiffres**. Détail et garde-fou en §5.2. |

### 2.2bis ☠️ Les échecs silencieux — la vraie leçon de la Phase 0

Cette API ne signale presque jamais une erreur de filtre. Quatre modes d'échec constatés,
tous en **HTTP 200 sans tableau `errors`** :

| Cause | Symptôme | Ce qu'on croit |
|---|---|---|
| Nom de champ invalide (`abilityGameID` au lieu de `ability.id`) | 0 event | « aucun cast » |
| Prédicat non supporté (`source.id > 5`) | filtre ignoré | « filtre appliqué » |
| `limit` > 10000 | plafonné à 10000 | « tout est là » |
| Liste d'ids trop longue | `events: null` | crash, ou « zéro cast » |

→ **Aucun filtre serveur ne doit être considéré comme actif sans un compte de référence.**
Le test de non-régression (comparer volume filtré / non filtré sur un log témoin figé) doit
être un test automatisé permanent, pas une vérification de Phase 0.

### 2.3 Sémantique à ne pas confondre

- **`timestamp` d'un event** : millisecondes **relatives au début du rapport**, pas de la run ni du combat.
- **`fight.startTime`** : idem, relatif au rapport.
- **`report.startTime`** : timestamp **absolu** (epoch ms). Ne jamais le mélanger avec les précédents.
- **`startedAt`** : le seul absolu qu'on persiste, `report.startTime + fight.startTime` (§5.3). Sans lui les timestamps relatifs sont orphelins, puisqu'on ne stocke pas le rapport.
- Offsets : `offsetRun = event.timestamp - run.startTime`, `offsetBoss = event.timestamp - dungeonPull.startTime`.
- **`sourceID`** : local au rapport. Ne **jamais** le persister comme identifiant durable.
- **`abilityGameID`** dans les events, mais **`ability.id`** dans les `filterExpression`. Deux noms pour la même chose — et `abilityGameID` en filtre renvoie 0 event sans erreur.
- ⚠️ **`ability.id` ne pointe pas vers un champ fixe** : il se résout selon le type d'event (`abilityGameID`, `killingAbilityGameID` sur un `death`, `extraAbilityGameID` sur un `aurabroken`). Un même filtre ramène donc des events dont l'`abilityGameID` vaut 0.
- `dataType: Casts` renvoie **quatre** types, pas deux : `cast`, `begincast`, et — pour les sorts *empowered* de l'Évoquateur — `empowerstart` / `empowerend`. Filtrer sur `type = 'cast'` reste correct ; un `type != 'begincast'` serait faux.
- **`dataType: All` ignore `hostilityType`** et ramène joueurs et boss en une requête. `dataType: Casts` reste borné à `Friendlies` par défaut.
- **`encounterID` d'un donjon est saisonnier**, `gameZone.id` est stable entre saisons (§5.1).

---

## 3. Stack

| Couche | Choix | Justification |
|---|---|---|
| Langage | TypeScript de bout en bout | Types partagés entre parsing et affichage — critique vu que la donnée source est non typée |
| Front | React + Vite (SPA) | Aucun besoin de SSR. Fichiers statiques, hébergeable partout |
| API | Fastify (process Node séparé) | Séparation front / backend, redémarrage indépendant |
| Jobs | BullMQ sur Redis | Retry, rate limiting worker, `jobId` explicite pour la déduplication |
| Cache / locks | Redis (même instance) | Déjà présent pour BullMQ |
| BD | PostgreSQL | JSONB + index GIN si besoin de requêter dans les casts. MySQL acceptable sinon |
| ORM | Prisma + Zod | Zod compense l'absence de typage des colonnes `Json` chez Prisma |
| Hébergement | VPS + Docker Compose | Jobs longs incompatibles avec le serverless (timeouts) |

**Alternative ORM** : MikroORM type nativement les colonnes JSON (`@Property({ type: 'json' }) casts!: Cast[]`), ce qui supprime une couche. Contrepartie : décorateurs + `reflect-metadata`, courbe d'apprentissage de l'Unit of Work. À réserver au worker si retenu, jamais importé côté front.

**Zod reste nécessaire dans les deux cas** : le typage statique ne protège pas d'un changement de structure côté WCL. La validation à la frontière est ce qui fera échouer bruyamment plutôt que silencieusement.

---

## 4. Architecture

### 4.1 Flux de scan — 3 requêtes par run, quel que soit le nombre de boss et de joueurs

```
1. report.fights                    → fenêtre de la run + dungeonPulls (les boss)
2. report.playerDetails (+ masterData.actors + masterData.abilities)
                                    → roster, specs, pets, noms et icônes de sorts
3. report.events (dataType: All)    → tous les events filtrés, joueurs ET boss
```

**Coût mesuré**, run M+ complète de 30 minutes :

| Requête | Points |
|---|---|
| `report.fights` | 1,00 |
| `report.playerDetails` + `masterData.actors` + `masterData.abilities` | 1,00 |
| `report.events` filtré, 1 page | 1,00 |
| **Total par run** | **~3** |
| *sans filtre, 2 pages* | *4,24* |

→ **~1200 runs/h** avec filtre, ~850 sans. `worldData.zones` s'ajoute une fois pour toutes,
hors scan.

L'ordre compte : `playerDetails` doit précéder `events`, puisque les specs du groupe servent
à construire la liste de sorts du filtre (§5.2).

### 4.2 Découpage des jobs

**Un job = une run.** C'est l'unité soumise (§4.7) et l'unité stockée (§5) ; le job suit.

```ts
await queue.add('scan-run',
  { reportCode, fightID },
  { jobId: `${reportCode}-${fightID}` }  // idempotence gratuite
);
```

⚠️ **Séparateur `-`, pas `:`** — BullMQ v6 rejette un `jobId` personnalisé contenant `:`
(`Error: Custom Id cannot contain :`). Vérifié à l'installation.

⚠️ **Arrêt du worker : `close()`, jamais `close(true)`.** L'arrêt forcé ne rend jamais la main
en BullMQ 6.1.2. Et passer des **options** de connexion à BullMQ plutôt qu'une instance
ioredis : il ne ferme que les connexions qu'il a créées, sinon le process ne se termine pas.

Découper par run ne coûte presque rien : sur les 3 requêtes, seule `events` est propre à la
run. `fights` et `playerDetails` sont **cachables par rapport** dans Redis, ce qui rend la
2ᵉ run d'un même rapport moins chère que la 1ʳᵉ (1 point au lieu de 3).

⚠️ Ne pas confondre avec un scan de rapport entier : le témoin contient 9 runs. Les scanner
toutes sur une simple soumission ferait payer 9× ce que l'utilisateur a demandé.

### 4.3 Identification des boss

⚠️ **En M+, les boss ne sont pas des fights.** Tous les fights d'un rapport M+ portent
l'`encounterID` du **donjon** ; les boss sont dans `fight.dungeonPulls[]`. Il n'existe donc
pas de « mode boss unique » : une URL désigne toujours une run entière.

```
fight 3 "Algeth'ar Academy" enc 112526 — 10 dungeonPulls :
  pull  1  enc     0  "Vile Lasher"          ← trash
  pull  2  enc  2563  "Overgrown Ancient"    ← BOSS, orderIndex 0
  pull  6  enc  2564  "Crawth"               ← BOSS, orderIndex 1
  pull  8  enc  2562  "Vexamus"              ← BOSS, orderIndex 2
  pull 11  enc  2565  "Echo of Doragosa"     ← BOSS, orderIndex 3
```

- **Un boss = un `dungeonPull` à `encounterID !== 0`** (le trash porte 0).
- **`orderIndex` est la position dans cette liste filtrée**, pas `pull.id` — celui-ci a des
  trous (pas de pull 5 ci-dessus). Les donjons à ordre libre rendent cet index indispensable :
  un boss ouvert en premier ou en dernier n'a pas les mêmes cooldowns disponibles.
- **`dungeonPull` n'expose pas de `kill`.** Le seul `kill` fiable est celui de la run.
- Le croisement avec `worldData.zone(id:).encounters` ne sert **qu'à identifier le donjon** :
  cette liste ne contient que les 8 donjons de la saison, jamais les boss. Un `encounterID`
  de boss en est toujours absent — inutile de loguer une anomalie sur ce critère.
- **Les boss ne sont résolubles nulle part côté API** : `worldData.encounter(2563)` renvoie
  `null`, et aucune des 44 zones ne les liste. D'où la table `Boss` (§5.1), que le scan doit
  upserter à la découverte.
- **Toujours identifier par `encounterID`, jamais par nom.** WCL normalise en pratique les
  noms de PNJ en anglais, même sur un rapport CN — mais c'est un comportement observé, pas
  une garantie. Le nom sert à l'affichage, jamais de clé.

### 4.4 Pagination des events

Curseur temporel, pas de numéro de page :

```ts
let startTime = fightStart;
let pages = 0;
const all: RawEvent[] = [];

while (true) {
  const res = await fetchEvents({ startTime, limit: 10000 });
  all.push(...res.data);

  if (!res.nextPageTimestamp) break;
  if (res.nextPageTimestamp <= startTime) {
    throw new Error(`Curseur non progressif: ${reportCode} @ ${startTime}`);
  }
  if (++pages > MAX_PAGES) {
    throw new Error(`Pagination runaway: ${reportCode}`);
  }
  startTime = res.nextPageTimestamp;
}
```

**Le garde-fou n'est pas optionnel**, même si le budget s'est révélé confortable : une boucle
qui s'emballe reste le plus mauvais usage possible des points.

Vérifier `rateLimitData` **à chaque page**, pas une fois par job.

**Ce que la mesure a établi :**

- **Le coût est d'environ 1 point par page, quel que soit son remplissage.** Une page de
  76 events coûte autant qu'une page de 10 000 → **`limit` doit toujours être au maximum**.
  Le descendre à 100 multiplie le coût par 12 pour la même donnée.
- **Le plafond réel est 10 000, appliqué silencieusement.** `limit: 25000` et `limit: 100000`
  renvoient 10 000 events sans erreur.
- **`limit` compte les events retournés, pas scannés.** Un filtre serré réduit donc réellement
  le nombre de pages : 76 events filtrés tiennent en une page couvrant les 1772 s de la run.
- ⚠️ **Une page peut dépasser `limit`.** Avec `limit: 100`, plusieurs pages ont renvoyé 101
  events — WCL ne coupe pas au milieu d'un timestamp. Ne jamais écrire
  `assert(data.length <= limit)`.
- Sous `dataType: All`, compter ~5,3 events par cast : le seuil de pagination tombe vers
  ~1900 casts filtrés au lieu de 10 000.

### 4.5 Gestion du rate limit

Pattern recommandé par WCL : servir depuis le cache si possible ; si `pointsSpentThisHour / limitPerHour > 0.8` et que la requête est de basse priorité, la remettre en file.

```ts
const { limitPerHour, pointsSpentThisHour, pointsResetIn } = res.rateLimitData;

if (pointsSpentThisHour / limitPerHour > 0.8) {
  await queue.rateLimit(pointsResetIn * 1000);
  throw Worker.RateLimitError();   // BullMQ repositionne le job
}
```

Piloter sur le solde réel, jamais sur une estimation du coût — celui-ci dépend du volume retourné, non calculable à l'avance.

⚠️ **À garder en proportion.** La mesure donne ~3 points par run sur 3600/h, soit ~1200 runs
à l'heure. Ce mécanisme est un filet contre un emballement, pas le dimensionnement du
système. Le vrai facteur limitant est la justesse du parsing (§8).

### 4.6 Mode on-demand

Le budget est attaché au **client OAuth**, donc partagé par tous les visiteurs. Mode d'échec asymétrique : parfait en test solo, cassé dès que le service marche.

La mesure relativise le risque — ~1200 runs/h — sans le supprimer : le budget reste commun,
donc un seul abus le vide pour tout le monde.

Trois protections, par ordre d'impact :

1. **Cache sur `(reportCode, fightID)`** — une run terminée est immuable. Seul endroit du pipeline où le cache est trivialement correct. Cacher aussi `fights` et `playerDetails` **par rapport** : deux runs du même rapport ne paient alors qu'une fois (§4.2).
2. **Déduplication in-flight** — lock Redis sur la clé de scan ; les requêtes concurrentes s'abonnent au job en cours.
3. **Quota applicatif par utilisateur** — ⏸️ **pas maintenant.** La marge mesurée (~1200
   runs/h) rend le cache et la déduplication suffisants tant que le service reste confidentiel.
   À reprendre dès qu'il devient public : un seul script abusif vide le pot commun.

**Rapports privés : hors périmètre.** Une URL vers un rapport inaccessible en client
credentials est refusée à l'étage 2 de la validation (§4.7), au même titre qu'un code invalide.

### 4.7 Parsing d'URL

**L'unité soumise est une run, jamais un rapport. Une URL nue est refusée.** Un rapport
contient couramment plusieurs runs — le log témoin en porte **9, sur 2 donjons différents** —
et rien ne permet de deviner laquelle l'utilisateur vise.

Formes acceptées : `?fight=N`, `#fight=N`, `fight=last`. Le paramètre `source=N` peut être
présent si un joueur a été sélectionné sur le site ; il est ignoré.

**Validation en deux étages, dans cet ordre :**

**Étage 1 — parsing, aucun appel API, 0 point.** Rejette immédiatement toute URL sans
paramètre `fight` exploitable, ainsi que tout code de rapport malformé. C'est le cas le plus
fréquent d'erreur utilisateur et il ne doit rien coûter.

**Étage 2 — une requête `fights`, 1 point.** Établit que :

1. le rapport est accessible (sinon : privé, ou code invalide) ;
2. le fight demandé existe ;
3. **`fight.keystoneLevel` est non nul.** C'est le seul critère fiable d'une run M+. Un fight
   existant ne suffit pas : le témoin contient un fight `Solar Zealot` à `encounterID: 0`
   sans `keystoneLevel`, et un rapport peut mélanger raid et M+.

`fight=last` se résout sur le dernier fight **portant un `keystoneLevel`**, pas sur le
dernier fight tout court — sinon on tombe sur un pull de trash de fin de session.

Échouer ici coûte au plus une requête `fights` ; échouer dans le worker coûte des points et
de l'attente.

---

## 5. Schéma de base de données

> **Révisé après la Phase 0.** Les constats qui ont forcé cette révision sont dans
> `recon/NOTES.md` — principalement E1 (les boss sont des `dungeonPulls`, pas des fights),
> E7 (le cooldown est mesurable), E11/E12 (budget du filtre → restriction par spec).

### 5.1 Référentiel du monde : saisons, donjons, boss

Ce référentiel n'est pas un confort d'affichage, il est **imposé par l'API** :

- **Les boss de M+ n'existent nulle part dans `worldData`.** `worldData.encounter(2563)`
  renvoie `null`, et un balayage des 44 zones ne les trouve pas. La seule occurrence d'un nom
  de boss est `dungeonPull.name`, dans un rapport. La table `Boss` est donc la **seule**
  source possible.
- **L'`encounterID` d'un donjon change à chaque saison.** Sur 36 donjons réapparaissant en
  M+, aucun ne conserve son id : Ruby Life Pools vaut `12521` (S1 TWW), `62521` (S4 DF),
  `112521` (S2 Midnight). Le suffixe, lui, est stable — et c'est `fight.gameZone.id`.

→ **`gameZone.id` est l'identité inter-saisons d'un donjon ; `encounterID` en est la
déclinaison saisonnière.** Confondre les deux casse toute comparaison entre saisons.

**Ce que `gameData` seede directement :**

| Table | Source | Coût |
|---|---|---|
| `WowClass`, `WowSpec` | `gameData.classes { id name slug specs { id name slug } }` — 13 classes, 40 specs | 1 pt |
| `Boss.name` | `gameData.npc(gameID)` — noms canoniques, identiques à `dungeonPull.name` | 1 pt / lot |
| `Spell.name`, `Spell.icon` | `gameData.ability(id)`, ~200 par requête (§5.2) | 1 pt / 200 |
| `Dungeon`, `DungeonSeason` | `worldData.zone(id) { encounters { id name } }` | 1 pt |

⚠️ **`GameSpec.id` n'est PAS le `specID` Blizzard.** C'est un index par classe — Guardian y
vaut `3`, alors que `CombatantInfo.specID` vaut `104`. Pire, la numérotation est trouée :
Rogue expose `1:Assassination, 3:Subtlety, 4:Outlaw`, sans `2`. **La clé de `WowSpec` reste le
`specID` Blizzard** ; `gameData.classes` ne sert qu'à peupler noms, slugs et rattachement à la
classe, en joignant **par le nom**. Le couple (`specID`, nom) s'apprend aussi tout seul au
scan : `CombatantInfo.specID` et `playerDetails[].specs[].spec` décrivent le même joueur.

```prisma
model Season {
  id          Int     @id @default(autoincrement())
  zoneId      Int     @unique          // worldData zone (47 = M+ S1, 55 = M+ S2)
  name        String  @db.VarChar(64)
  expansionId Int
  active      Boolean @default(false)

  dungeons DungeonSeason[]
  runs     ScannedRun[]
}

model Dungeon {
  gameZoneId Int    @id                // fight.gameZone.id — STABLE entre saisons
  slug       String @unique @db.VarChar(64)
  name       String @db.VarChar(128)

  seasons DungeonSeason[]
  bosses  Boss[]
  runs    ScannedRun[]
}

// L'encounterID saisonnier du donjon. Un donjon revient avec un id différent.
model DungeonSeason {
  dungeonId   Int
  seasonId    Int
  encounterID Int @unique              // ce que porte fight.encounterID

  dungeon Dungeon @relation(fields: [dungeonId], references: [gameZoneId])
  season  Season  @relation(fields: [seasonId], references: [id])

  @@id([dungeonId, seasonId])
  @@index([seasonId])
}

model Boss {
  encounterID Int    @id               // dungeonPull.encounterID — introuvable via worldData
  npcGameId   Int?   @unique           // masterData.actors[subType=Boss].gameID — id Blizzard
  dungeonId   Int
  slug        String @unique @db.VarChar(64)
  name        String @db.VarChar(128)  // via gameData.npc(npcGameId), canonique

  dungeon Dungeon       @relation(fields: [dungeonId], references: [gameZoneId])
  spells  Spell[]
  pulls   ScannedBoss[]

  @@index([dungeonId])
}
```

⚠️ **Pas d'`orderIndex` sur `Boss`** : les donjons à ordre libre n'ont pas d'ordre canonique.
L'ordre est une propriété de la run, il vit sur `ScannedBoss` (§5.2).

⚠️ La stabilité inter-saisons des `encounterID` de **boss** (2562-2565) est plausible — ils
partagent l'espace de numérotation des `gameZone.id` — mais **non vérifiée** : il faudrait un
rapport d'un donjon réapparu en deux saisons.

→ **Parade déjà en place** : `npcGameId` est un id de créature Blizzard, indépendant de toute
notion de saison ou de zone WCL. Si les `encounterID` de boss s'avéraient saisonniers comme
ceux des donjons, `npcGameId` reste le pont durable et la migration se ferait sans re-scan.
C'est la raison de le stocker même s'il paraît redondant aujourd'hui.

### 5.2 Référentiel des sorts

La classe n'est plus un champ de texte : c'est une table. La spec en est une aussi, avec
clé étrangère vers la classe. Les sorts sont stockés individuellement et rattachés aux specs
par une table pivot.

```prisma
enum SpellCategory {
  DEFENSIVE
  OFFENSIVE
  EXTERNAL
  BOSS
  HEALING
}

model WowClass {
  id    Int    @id                     // id Blizzard (1..13)
  slug  String @unique @db.VarChar(24) // 'death-knight'
  name  String @db.VarChar(24)         // 'Death Knight'
  color String @db.VarChar(7)          // couleur de classe, pour la timeline

  specs      WowSpec[]
  characters Character[]
}

model WowSpec {
  id      Int    @id                     // specID Blizzard (104 = Guardian)
  classId Int
  slug    String @unique @db.VarChar(32) // 'guardian'
  name    String @db.VarChar(32)         // 'Guardian'
  role    String @db.VarChar(8)          // 'tank' | 'healer' | 'dps'

  class          WowClass           @relation(fields: [classId], references: [id])
  spells         SpellSpec[]
  participations RunParticipant[]

  @@index([classId])
}

model Spell {
  spellId  Int           @id            // abilityGameID côté events, ability.id côté filtre
  // name et icon viennent de gameData.ability(id) au seed (~200 par requête),
  // rattrapés au vol via masterData.abilities si un sort inconnu apparaît.
  // Seuls category et le rattachement aux specs sont saisis à la main.
  name     String        @db.VarChar(128)
  icon     String?       @db.VarChar(128)   // nom de fichier Blizzard, pas une URL
  category SpellCategory

  // Mesuré sur le corpus (min des écarts entre deux casts), pas saisi à la main.
  cooldownSec        Int?
  cooldownSamples    Int?      @default(0)  // n ayant servi à la mesure — sans lui, aucune confiance
  cooldownMeasuredAt DateTime?

  bossEncounterID Int?      // renseigné ⇔ sort de boss
  active          Boolean   @default(true)

  boss  Boss?       @relation(fields: [bossEncounterID], references: [encounterID])
  specs SpellSpec[]

  @@index([category])
  @@index([bossEncounterID])
}

// Pivot sort ↔ spec. Un sort de classe génère une ligne par spec de la classe.
model SpellSpec {
  spellId Int
  specId  Int

  spell Spell   @relation(fields: [spellId], references: [spellId], onDelete: Cascade)
  spec  WowSpec @relation(fields: [specId], references: [id])

  @@id([spellId, specId])
  @@index([specId])          // l'index qui porte la requête de construction du filtre
}
```

**Origine des données — `gameData` résout tout sauf la curation.**

Le seed manuel ne porte que sur ce qu'aucune API ne donne : la liste des `spellId` à suivre,
leur `category`, et leur rattachement aux specs. **Tout le reste a une source.**

**Nom et icône d'un sort, hors rapport** — `gameData.ability(id)` est un lookup global. Il
répond sur n'importe quel `spellId`, y compris absent de tout rapport scanné :

```graphql
{
  a0: gameData { ability(id: 42650) { id name icon } }
  a1: gameData { ability(id:   871) { id name icon } }
  # … jusqu'à ~200 alias par requête
}
```

**Coût mesuré** : 200 alias = **1 point**, 500 alias = 2 points. Seeder 700 sorts coûte donc
~3 points au total. C'est la méthode à retenir.

⚠️ **Ne jamais dumper `gameData.abilities(limit, page)`** : le catalogue complet fait
**457 369 entrées sur 4574 pages**, soit ~4574 points. Il est là pour de l'exploration, pas
pour un seed.

**En complément, pas en remplacement** — `masterData.abilities` renvoie
`{ gameID, name, icon, type }` pour toutes les abilities d'un rapport (787 sur le témoin,
100 % avec icône), dans le même objet `masterData` que les pets, donc **sans call
supplémentaire**. Utile pour rattraper au vol un sort découvert mais non seedé.

`icon` est un **nom de fichier** Blizzard (`spell_deathknight_armyofthedead.jpg`), pas une URL.
On stocke le nom de fichier, jamais l'URL — la source doit rester interchangeable.

**Source retenue : le CDN first-party de Blizzard.**

```
https://render.worldofwarcraft.com/us/icons/{size}/{icon}
```

Comportement vérifié :

| Point | Constat |
|---|---|
| Tailles | `18`, `36`, `56` — toutes servies (1,0 / 1,8 / 2,9 Ko) |
| Régions | `us`, `eu`, `kr`, `tw` identiques ; **`cn` renvoie 403** — prendre `us` |
| Extension | `.jpg` **obligatoire** : sans elle, 403. Elle est déjà dans `Spell.icon` |
| Icônes de boss | servies comme les autres |
| Icône inexistante | **403, pas 404**, avec un corps `application/xml` |

⚠️ Le 403 sur icône manquante impose un `onError` côté front : le navigateur reçoit du XML là
où il attend une image, et rien ne distingue « absente » de « interdite ». Prévoir un
placeholder par `SpellCategory`.

Écartés : `assets.rpglogs.com` (CDN de WCL, viable mais second choix) et
`wow.zamimg.com` (Wowhead, tiers non sollicité).

L'art reste la propriété de Blizzard, dont la Fan Content Policy encadre l'usage, et le §2.1
rappelle que WCL exige une approbation préalable pour tout usage commercial. **À vérifier
avant mise en ligne publique, pas avant d'écrire le code.**

**Aucun discriminant de portée n'est nécessaire** : l'appartenance se lit dans les relations.
Un sort sans ligne dans `SpellSpec` et sans `bossEncounterID` est un sort inter-classes
(consommable, bijou, racial) — toujours inclus, par définition. Un enum `scope` répéterait
une information que le modèle porte déjà, avec le risque de désynchronisation habituel.

**Construction du filtre au scan** — après `playerDetails`, donc sans requête WCL
supplémentaire :

```sql
SELECT s."spellId" FROM "Spell" s WHERE s.active AND (
     s."bossEncounterID" IS NOT NULL                       -- tous les sorts de boss
  OR NOT EXISTS (SELECT 1 FROM "SpellSpec" x               -- sorts sans spec = inter-classes
                 WHERE x."spellId" = s."spellId")
  OR EXISTS (SELECT 1 FROM "SpellSpec" ss                  -- sorts des specs présentes
             WHERE ss."spellId" = s."spellId" AND ss."specId" = ANY($specIDs))
);
```

`$specIDs` = **union** de toutes les specs vues dans `playerDetails[].specs` (un joueur peut
changer de spec entre deux fights du rapport).

**Le préfiltre par spec met la limite hors de portée.** Ordre de grandeur : ~80 sorts pour
5 specs, ~30 inter-classes, ~200 sorts de boss pour toute la saison — soit ~310 ids, coût
calculé ~3500 contre un budget de 6500. Inutile de restreindre les sorts de boss aux
`encounterID` de la run : on les prend tous.

⚠️ Le garde-fou reste obligatoire, parce que le mode d'échec est muet :

```ts
const FILTER_BUDGET = 6500;   // ~7215 mesuré, marge de 10 %
const cost = (ids: number[]) => ids.reduce((s, id) => s + String(id).length + 4.23, 0);
if (cost(ids) > FILTER_BUDGET) throw new FilterTooLargeError(ids.length);
```

Au-delà du budget, l'API renvoie `events: null` en HTTP 200 **sans erreur GraphQL**. Rien
d'autre ne préviendra.

### 5.3 Runs, boss et roster

```prisma
model ScannedRun {
  // Pas de table Report : `reportCode` est une référence d'origine, pas une entité.
  // On ne stocke que des runs — une URL sans fight de run est refusée (§4.7).
  reportCode   String @db.VarChar(32)
  fightID      Int              // en M+, le fight EST la run (E1)

  seasonId           Int
  dungeonEncounterID Int        // fight.encounterID — SAISONNIER (§5.1)
  gameZoneId         Int        // fight.gameZone.id — l'identité stable du donjon

  // Non nullables : leur présence EST le critère de validation d'une run M+ (§4.7)
  keystoneLevel   Int
  keystoneTime    Int
  keystoneBonus   Int           // nombre de chronos ; 0 = clé non validée
  keystoneAffixes Int[]
  kill            Boolean       // le seul kill fiable est au niveau run (E1)

  // ⚠️ Seul ancrage absolu du système. Sans lui, `startTime` et les timestamps
  // d'events sont orphelins : ils sont relatifs à un rapport qu'on ne stocke pas.
  //   startedAt = report.startTime (epoch ms) + fight.startTime (relatif)
  startedAt    DateTime
  startTime    Int              // relatif au rapport — conservé pour recalculer les offsets
  duration     Int

  spellSetVersion Int
  scannedAt    DateTime @default(now())

  season       Season  @relation(fields: [seasonId], references: [id])
  dungeon      Dungeon @relation(fields: [gameZoneId], references: [gameZoneId])
  bosses       ScannedBoss[]
  participants RunParticipant[]

  @@id([reportCode, fightID])
  @@index([seasonId, dungeonEncounterID, keystoneLevel])
  @@index([gameZoneId, keystoneLevel])          // comparaison INTER-saisons d'un donjon
  @@index([seasonId, scannedAt])
}

model ScannedBoss {
  reportCode  String @db.VarChar(32)
  fightID     Int
  orderIndex  Int              // position parmi les dungeonPulls à encounterID != 0
  pullId      Int              // dungeonPull.id — a des trous, ne jamais l'utiliser comme ordre
  encounterID Int              // id du BOSS, non résoluble via worldData (§5.1)

  startTime   Int              // relatif au rapport
  duration    Int

  // Les events de CETTE fenêtre de boss, compactés :
  // [timestamp, sourceID, abilityGameID, type] — offsets recalculés à la lecture.
  // ~31 Ko par boss mesuré. Le trash n'est pas conservé (§5.6).
  events      Json

  run  ScannedRun @relation(fields: [reportCode, fightID], references: [reportCode, fightID], onDelete: Cascade)
  boss Boss       @relation(fields: [encounterID], references: [encounterID])

  @@id([reportCode, fightID, orderIndex])
  @@index([encounterID])
}

model Character {
  guid       Int    @id                     // identifiant global WCL
  name       String @db.VarChar(64)
  serverSlug String @db.VarChar(64)
  region     String @db.VarChar(4)          // présent dans playerDetails — 'CN', 'EU'…
  classId    Int

  class          WowClass           @relation(fields: [classId], references: [id])
  participations RunParticipant[]

  @@index([name, serverSlug, region])
  @@index([classId])
}

// Association ternaire : personnage × run × spec.
// C'est la table qui porte toute la recherche (§6 Phase 3).
model RunParticipant {
  reportCode    String @db.VarChar(32)
  fightID       Int
  sourceID      Int              // local au rapport — le pont, jamais un id durable
  characterGuid Int
  specId        Int              // FK, plus une chaîne
  role          String? @db.VarChar(8)   // tank | healer | dps, depuis playerDetails
  talentTree    Json?            // [{ id, rank, nodeID }] — `talents` est mort côté WCL

  run       ScannedRun @relation(fields: [reportCode, fightID], references: [reportCode, fightID], onDelete: Cascade)
  character Character  @relation(fields: [characterGuid], references: [guid])
  spec      WowSpec    @relation(fields: [specId], references: [id])

  @@id([reportCode, fightID, sourceID])
  @@unique([reportCode, fightID, characterGuid])  // un personnage une seule fois par run
  @@index([characterGuid, specId])                // « les runs de ce joueur en telle spec »
  @@index([specId, characterGuid])                // « toutes les runs jouées en telle spec »
}

model ScanJob {
  id          String   @id            // `${reportCode}-${fightID}` — ':' interdit par BullMQ
  status      String   @db.VarChar(16)
  error       String?  @db.Text
  requestedAt DateTime @default(now())
  completedAt DateTime?

  @@index([status, requestedAt])
}
```

### 5.4 Justifications

- **Le référentiel est normalisé parce qu'il est interrogé, pas seulement affiché.** La
  requête de construction du filtre tourne à chaque scan ; `SpellSpec(specId)` est l'index
  qui la porte. Un champ `className` en texte ne permettait ni la jointure, ni la contrainte
  d'intégrité, ni la restriction par spec de E12.
- **Pas d'enum de portée sur `Spell`.** L'appartenance se déduit des relations : pas de ligne
  `SpellSpec` et pas de `bossEncounterID` ⇒ sort inter-classes, toujours inclus. Un enum
  dupliquerait une information déjà portée par le modèle et pourrait s'en désynchroniser. Le
  préfiltre par spec laisse assez de marge (~3500 sur 6500) pour prendre **tous** les sorts de
  boss sans les restreindre aux `encounterID` de la run.
- **Le donjon est identifié par `gameZoneId`, pas par `encounterID`.** Vérifié : sur 36 donjons
  réapparaissant en M+, **aucun** ne conserve son `encounterID` d'une saison à l'autre
  (Ruby Life Pools : 12521 → 62521 → 112521). Le suffixe stable est `fight.gameZone.id`.
  Indexer les runs sur `encounterID` seul rendrait toute comparaison inter-saisons impossible —
  d'où le second index `[gameZoneId, keystoneLevel]`.
- **`Boss` est une table parce que `worldData` ne donne pas les boss** : `worldData.encounter()`
  renvoie `null` sur les encounterID de boss M+, et le balayage des 44 zones ne les trouve pas.
  Le nom, lui, est récupérable — `masterData.actors` expose les acteurs `subType: "Boss"` avec
  leur `gameID` Blizzard, et `gameData.npc(gameID)` en donne le nom canonique (vérifié :
  identique à `dungeonPull.name` sur les 4 boss du témoin). D'où `npcGameId` sur la table.
  Le scan doit **upserter** `Boss` à la découverte, sinon la FK de `ScannedBoss` échoue sur
  tout donjon inconnu.
- **`ScannedBoss` ne stocke plus de nom** : il vient de `Boss`. Le nom du pull reste néanmoins
  à loguer au scan, pour détecter une divergence avec le référentiel.
- **`cooldownSec` est mesuré, pas saisi** (E7) : l'écart minimum entre deux casts d'un même
  sort par un même joueur donne le cooldown réel, talents et haste inclus. `cooldownSamples`
  accompagne obligatoirement la valeur — un sort lancé deux fois ne dit rien.
- **`ScannedRun` / `ScannedBoss` remplacent `ScannedFight`** : en M+ les boss ne sont pas des
  fights mais des `dungeonPulls` à l'intérieur du fight de run (E1). Les quatre boss d'une run
  partageaient donc la même clé primaire dans l'ancien schéma.
- **Les events sont sur le boss, pas sur la run.** Décision prise (§5.6) : seules les fenêtres
  de `dungeonPull` sont conservées, ce qui colle à l'objectif du §1 — une timeline boss par
  boss. Coût assumé : les 43 % de casts hors combat de boss sont **définitivement perdus**, et
  les récupérer un jour imposerait un re-scan complet du corpus.
- **Pas de table `Report`.** L'unité stockée est la run ; `reportCode` n'est qu'une référence
  d'origine et une composante de clé. Un rapport n'apporte rien qu'on veuille conserver — son
  titre, son propriétaire et sa visibilité ne servent pas la timeline, et une URL sans fight
  de run est refusée en amont (§4.7).
- **Conséquence directe : `startedAt` devient obligatoire.** `report.startTime` est le seul
  timestamp absolu de tout le système (§2.3), et il disparaît avec le rapport. Sans
  `startedAt = report.startTime + fight.startTime`, on ne peut plus dater une run — ni la
  trier, ni la comparer, ni détecter un corpus périmé. C'est le prix du choix « pas de table
  Report », et il se paie à l'écriture, une fois.
- **`keystoneLevel` est non nullable** parce que sa présence est le critère de validation
  d'une run M+ (§4.7). Une ligne sans niveau de clé ne devrait jamais entrer en base.
- **Le roster est externalisé** en `Character` + `RunParticipant`. Le `sourceID`, local au
  rapport, reste dans la table de jointure où il a du sens. L'identité (`guid`) est globale et
  se déduplique. `region` est indispensable : `name + serverSlug` n'est pas unique entre régions.
- **`spellSetVersion`** : le jour où la liste de sorts change en cours de saison, permet de
  re-scanner uniquement le delta au lieu de tout le corpus.
- **Pas de colonne de provenance** : tout le corpus vient des soumissions utilisateurs. Il n'y
  a donc pas de sous-ensemble contrôlé sur lequel calculer des agrégats non biaisés — c'est une
  limite structurelle du choix on-demand, à assumer plutôt qu'à corriger en base.
- **`seasonId` en tête des index composés** : le wipe saisonnier devient un
  `DELETE WHERE seasonId = X` par batches, au lieu d'un `DROP TABLE` qui ferme la porte aux
  comparaisons inter-saisons.
- **`WowClass` / `WowSpec` ne sont pas saisonnières** et survivent au wipe. Elles se seedent
  depuis les données statiques Blizzard, pas depuis WCL — `playerDetails` ne donne que des
  chaînes (`type: "Druid"`, `specs[].spec: "Guardian"`), le `specID` numérique venant de
  `CombatantInfo`.

### 5.5 Le lien joueur ↔ run, formalisé

`RunParticipant` est une **association ternaire personnage × run × spec**, et c'est le bon
grain — pas « personnage × rapport × spec ».

**Pourquoi la run et non le rapport.** Vérifié sur le log témoin (`recon/NOTES.md`, E13) :
entre les runs d'Algeth'ar Academy (fights 1 et 3) et celles de Skyreach (fights 4 et 9),
**les 5 joueurs ont changé d'arbre de talents**. Même `specID`, même équipement, même nombre
de points — allocation différente. Les joueurs se re-talentent par donjon. Une ternaire au
grain rapport aurait écrasé deux builds distincts en un seul.

La spec, elle, est restée stable sur les 4 runs sondées. C'est donc **le talentTree, pas la
spec, qui impose le grain run.**

**Les trois participants et ce qu'ils apportent :**

| Participant | Clé | Portée réelle côté API |
|---|---|---|
| Personnage | `characterGuid` | globale, stable entre rapports |
| Run | `(reportCode, fightID)` | le fight de run |
| Spec | `specId` | par fight (`CombatantInfo.specID`) |

Et `sourceID` n'est aucun des trois : c'est le **pont**, valide à l'échelle du rapport
uniquement. Il reste dans la clé primaire parce que c'est lui qui relie les events au
personnage, et nulle part ailleurs.

**Résolution au scan :**

```
playerDetails[].id      →  sourceID
playerDetails[].guid    →  Character.guid          (upsert)
CombatantInfo.specID    →  WowSpec.id              (par fight)
CombatantInfo.talentTree→  RunParticipant.talentTree (par fight)
events[].sourceID       →  RunParticipant.sourceID  (jointure locale au rapport)
```

⚠️ Un `sourceID` présent dans les events mais absent de `playerDetails` ne doit **jamais**
créer un `RunParticipant` : le rejeter en le loguant. Mesuré sur deux témoins, ce cas ne se
produit pas — aucun des sorts suivis n'est émis par une entité intermédiaire.

**Ce que la ternaire permet de chercher** (§6 Phase 3) :

```sql
-- « les runs de ce joueur dans cette spec, en +18 minimum »
SELECT r.* FROM "ScannedRun" r
JOIN "RunParticipant" p USING ("reportCode", "fightID")
WHERE p."characterGuid" = $1 AND p."specId" = $2 AND r."keystoneLevel" >= 18;
-- porté par RunParticipant(characterGuid, specId)

-- « toutes les runs de ce donjon jouées en Guardian, toutes saisons »
SELECT r.* FROM "ScannedRun" r
JOIN "RunParticipant" p USING ("reportCode", "fightID")
WHERE p."specId" = $1 AND r."gameZoneId" = $2;
-- porté par RunParticipant(specId, characterGuid) + ScannedRun(gameZoneId, keystoneLevel)
```

**Optimisation à ne PAS faire tout de suite** : dénormaliser `seasonId` / `gameZoneId` /
`keystoneLevel` sur `RunParticipant` transformerait la seconde requête en un seul parcours
d'index. À garder en réserve — §8 : ne pas optimiser avant la mesure.

### 5.6 Décisions tranchées sur le volume

Volumes mesurés sur la run témoin (1772 s, 5 joueurs) :

| Forme | Taille |
|---|---|
| Events bruts, tous types (13 902) | 1435 Ko |
| `type='cast'` seuls (11 743) | 1218 Ko |
| Compacté `[timestamp, sourceID, abilityGameID, type]` | 220 Ko |
| Filtré sur ~67 sorts suivis, `dataType: All` | 335 Ko |
| **Retenu : filtré + fenêtres de boss uniquement** | **~125 Ko/run, ~31 Ko/boss** |

**1. Filtrer par liste de sorts : oui.** C'est ce qui fait tenir le scan en une page (1 point
au lieu de 2,24) et ce qui rend le corpus exploitable. Le préfiltre par spec (§5.2) garde la
liste loin de la borne.

**2. Ne conserver que les fenêtres de boss : oui.** Sur les 11 743 casts de la run témoin,
6678 sont en combat de boss et 5065 sur du trash ou de la route. Seuls les premiers sont
persistés, répartis sur les lignes `ScannedBoss` — ~31 Ko par boss au lieu de 220 Ko par run.

⚠️ **Ce que ça coûte, explicitement.** Les cooldowns brûlés sur le trash disparaissent, alors
qu'ils expliquent souvent une absence de cooldown sur le boss suivant. Et comme l'API n'est
interrogée qu'une fois, les récupérer un jour imposerait un **re-scan complet du corpus** —
pas une migration. C'est le choix le moins réversible du schéma.

**3. Trier par type d'event : non.** À coût identique, `type = "cast"` côté serveur supprime
des `death` et des `aurabroken` qui portent du signal réel sur les mêmes sorts. On envoie
`ability.id in (…)` seul et on trie en post-traitement.

`spellSetVersion` reste donc **obligatoire** : la liste de sorts pilote ce qui entre en base,
et elle bougera pendant la saison. C'est lui qui permettra de re-scanner le delta.

⚠️ À ~31 Ko par ligne `ScannedBoss`, les requêtes de listing doivent sélectionner
explicitement les colonnes — jamais `SELECT *`.

---

## 6. Phasage

### Phase 0 — Reconnaissance ✅ faite (aucun code de production)

**Livrable produit** : `recon/NOTES.md` + 16 dumps sous `recon/dumps/`. Harnais jetable dans
`recon/` (zéro dépendance, Node natif). Les 6 points du §2.2 sont tranchés, 13 écarts au plan
documentés, ~200 points consommés.

**Restent ouverts, à faire avant d'ouvrir la Phase 1 :**

1. ⏳ **Validation croisée manuelle** — compter les casts d'un sort sur le site WCL et
   comparer à l'API. Non scriptable, et non optionnelle : un `sourceID` mal résolu ou un sort
   lancé par une entité intermédiaire produit **zéro résultat sans erreur**, le pire mode
   d'échec possible. Table à remplir dans `recon/NOTES.md`.
2. ⏳ **Stabilité inter-saisons des `encounterID` de boss.** Plausible (ils partagent l'espace
   de numérotation des `gameZone.id`) mais non vérifiée. Demande un log d'un donjon réapparu
   en deux saisons.
3. ⏳ **Seed du référentiel.** `gameData` couvre presque tout pour quelques points :
   `classes` (13 classes, 40 specs), `ability(id)` par lots de ~200 pour noms et icônes,
   `npc(gameID)` pour les noms de boss, `worldData.zone(id)` pour les donjons.
   **Reste manuel, et seulement ça** : quels `spellId` suivre, leur `category`, et leur
   rattachement aux specs. Les `Boss` sont upsertés à la découverte (§5.1).
4. ❌ **Flow authorization code — abandonné.** Les rapports privés sont hors périmètre. Le
   client WCL doit néanmoins garder son endpoint paramétrable, pour ne pas fermer la porte.

### Phase 1 — Pipeline de scan

- Client WCL : OAuth, refresh de token, wrapper GraphQL avec `rateLimitData` systématiquement
  injecté — le harnais `recon/wcl.mjs` en est le brouillon jetable, à réécrire en TypeScript.
- Schémas Zod pour chaque payload, dérivés des dumps de la Phase 0.
- Validation d'URL à deux étages (§4.7), refus strict d'une URL sans run.
- Découpage de la run en boss via `dungeonPulls`, avec `orderIndex`.
- Résolution du roster.
- Construction de la liste de sorts par spec + garde-fou de budget du filtre (§5.2).
- Pagination avec garde-fous (progression du curseur + plafond de pages + `limit` au maximum).
- Calcul de `startedAt`, `offsetRun` et `offsetBoss`.
- Persistance, upsert de `Boss` à la découverte.

**Critère de sortie** : scanner un log témoin de bout en bout et retrouver manuellement les mêmes casts sur le site WCL.

**Test de non-régression permanent** (§2.2bis) : sur un log témoin figé, comparer le volume
filtré au volume non filtré. Un écart nul ou un `events: null` signale un filtre mort.

### Phase 2 — Workers et files

- BullMQ, **un job par run**, `jobId = ${reportCode}:${fightID}`.
- Cache Redis de `fights` et `playerDetails` par rapport, pour que la 2ᵉ run d'un même rapport
  ne repaie pas (§4.2).
- Rate limiting piloté par `rateLimitData`.
- Retry avec backoff exponentiel, distinguant erreurs transitoires et permanentes (rapport privé, fight inexistant, filtre trop long).
- Déduplication in-flight par lock Redis.

**Critère de sortie** : deux requêtes simultanées sur la même run ne déclenchent qu'un scan.

### Phase 3 — API et recherche

- `POST /scan` : parse d'URL, validation à deux étages, mise en file, retour d'un id de job.
- `GET /scan/:id` : statut, avec abonnement au job en cours si déjà lancé.
- `GET /runs` : recherche par saison, donjon, spec, niveau de clé, joueur — portée par
  `RunParticipant` (§5.5).
- `GET /runs/:reportCode/:fightID` : payload complet pour la timeline. Sélectionner les
  colonnes explicitement — `events` pèse 220 Ko.

### Phase 4 — Front

- Timeline unique par défaut (couleur de classe pour distinguer les joueurs), expansion en lanes au clic.
- Zoom via `PX_PER_SEC`.
- Positionnement DOM absolu — le volume ne justifie pas canvas ni virtualisation : avec des cooldowns ≥ 30 s sur un combat de 2 min, on parle d'une quinzaine d'icônes.
- Playhead découplé du scroll natif (state piloté), pour permettre clic, clavier et lien profond.
- Affichage des deux offsets : boss et run.
- Icônes et noms de sorts depuis `Spell`, couleurs de joueur depuis `WowClass.color`, noms de
  boss depuis `Boss` — le tout caché agressivement, ce référentiel ne bouge pas.

**Zone grisée de cooldown — devenue défendable.** Griser l'intervalle suivant chaque cast rend
visibles les fenêtres où le sort était disponible mais non utilisé. La Phase 0 a montré que
`cooldownSec` se **mesure** sur le corpus (`min` des écarts entre deux casts d'un même sort par
un même joueur) plutôt que de se saisir : les valeurs trouvées sur le témoin — 90,0 s pour
Army of the Dead, 45,0 s pour 1233448, 42,0 s pour Anti-Magic Shell — sont les cooldowns réels,
talents et haste compris.

Reste à présenter comme une aide visuelle : la mesure capture le build le plus réducteur
observé, pas nécessairement celui du joueur affiché. Afficher `cooldownSamples` à côté, et
ne rien griser sous un `n` trop faible.

**Bénéfice du choix « ne pas trier par type » (§5.6)** : `applybuff` / `removebuff` donnent la
**durée réelle d'activité** du défensif, pas seulement l'instant où il est pressé. La barre
peut donc montrer l'effet, pas juste le clic.

---

## 7. Pièges recensés

### 7.1 Échecs silencieux — HTTP 200, aucune erreur GraphQL

Les plus dangereux : rien ne les signale, et le corpus paraît correct.

| # | Piège | Symptôme | Parade |
|---|---|---|---|
| 1 | `abilityGameID` au lieu de `ability.id` en filtre | **0 event** | Compte de référence obligatoire |
| 2 | Prédicat non supporté (`source.id`, `source.disposition`) | Filtre **ignoré** | Idem — ne jamais supposer un filtre actif |
| 3 | `limit` > 10 000 | Plafonné en silence | Toujours `limit: 10000`, ne pas croire au-delà |
| 4 | Liste d'ids > budget (`Σ chiffres+4,23 > ~7215`) | **`events: null`** | Garde-fou avant envoi (§5.2) |
| 5 | Corpus pris pour un échantillon représentatif | Statistiques biaisées | Réserve affichée (§1) |

### 7.2 Erreurs de modèle

| # | Piège | Conséquence |
|---|---|---|
| 7 | Chercher les boss dans `report.fights` | Aucun boss trouvé — ils sont dans `dungeonPulls` |
| 8 | `pull.id` utilisé comme `orderIndex` | Ordre faux : la numérotation a des trous |
| 9 | `encounterID` de donjon traité comme stable | Comparaison inter-saisons impossible — utiliser `gameZone.id` |
| 10 | `talents` lu au lieu de `talentTree` | Tableau vide, silencieusement |
| 11 | Talents stockés au grain rapport | Écrase des builds distincts : ils changent par run |
| 12 | `sourceID` persisté comme id durable | Attribution erronée entre rapports |
| 13 | Identification des boss par nom | Fragile : la normalisation WCL est observée, non garantie |
| 14 | `keystoneLevel` nullable | Des fights de raid ou de trash entrent en base |

### 7.3 Erreurs d'exécution

| # | Piège | Conséquence |
|---|---|---|
| 15 | Confusion timestamp absolu / relatif | Offsets aberrants, ou subtilement faux |
| 16 | `startedAt` non calculé au scan | Runs indatables — le rapport n'est pas stocké |
| 17 | `assert(data.length <= limit)` | Faux : une page rend 101 events pour `limit: 100` |
| 18 | Boucle de pagination sans garde-fou | Budget horaire vidé en secondes |
| 19 | `limit` bas « pour ménager l'API » | Coût ×12 : le point se paie par page, pas par event |
| 20 | Scan du rapport entier sur soumission d'une run | 9× le coût demandé sur le témoin |
| 21 | `begincast` non filtré en post-traitement | Doublons pris pour des double casts |
| 22 | Rapport devenu privé après scan | Lien mort, copie orpheline — assumé : on ne re-vérifie pas |

---

## 8. Ordre de travail

**Fait :**

1. ✅ Phase 0 — 6 hypothèses tranchées, 13 écarts documentés (`recon/NOTES.md`).
2. ✅ Coût mesuré : ~3 points par run filtrée, ~1200 runs/h.
3. ✅ « Filtrer ou tout stocker » tranché (§5.6) : filtrer par liste de sorts, ne pas trier par
   type d'event.
4. ✅ Budget sous token utilisateur : question devenue sans objet.

**Décisions de périmètre prises :**

- Rapports privés : **hors périmètre**, client credentials uniquement.
- Casts hors combat de boss : **non conservés** — choix le moins réversible du schéma (§5.6).
- Quota par utilisateur : **repoussé**, à reprendre avant toute mise en ligne publique.
- Noms et icônes de sorts : **fournis par l'API** (`gameData.ability`, ~200 par requête),
  pas saisis. Idem classes, specs et noms de boss.

**À faire, dans cet ordre :**

5. Clore la Phase 0 : la validation croisée manuelle, dernier point restant.
6. Seeder le référentiel. La partie automatisable coûte une dizaine de points via `gameData`
   et `worldData` ; la partie humaine se limite à la liste des `spellId` suivis, leur
   `category` et leur rattachement aux specs. Sans elle, aucun scan ne peut construire son
   filtre ni satisfaire ses clés étrangères.
7. Vérifier les droits d'usage des icônes avant toute mise en ligne publique (§5.2).
8. Phases 1 à 4 dans l'ordre.

### Ce que la mesure a corrigé

Ce plan annonçait : *« le facteur limitant sera le budget de points et la qualité du
parsing »*. **La moitié est fausse.** À 3 points par run sur 3600/h, le budget n'est pas
contraignant et ne dimensionne rien.

**Le seul facteur limitant est la justesse du parsing** — et la Phase 0 a montré que le
danger n'est pas de se tromper bruyamment, mais que cette API accepte silencieusement des
filtres morts (§7.1). Un scan anormalement *pauvre* est bien plus probable qu'un scan
anormalement cher.

**Ne pas optimiser avant la mesure** reste valable. Deux optimisations sont explicitement
mises en réserve : la dénormalisation de `seasonId` / `gameZoneId` / `keystoneLevel` sur
`RunParticipant` (§5.5), et tout index GIN sur `events`.
