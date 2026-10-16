# Phase 0 — Notes de reconnaissance

> Livrable de la Phase 0 (§6). Critère de sortie : *« chaque point de la section 2.2 est
> tranché, avec un exemple de payload à l'appui. »* — **atteint**.

Log témoin : `TaqLH6KvWAG3XVP8`, fight 3 — Algeth'ar Academy +24, kill, 1772 s, groupe **CN**
(noms de joueurs en chinois, noms de PNJ normalisés en anglais par WCL — voir E2).
Date des dumps : 2026-08-17. Budget observé : **3600 pts/h**.

---

## Tableau de sortie — les 6 points ⚠️ VÉRIFIER du §2.2

| # | Point | Statut | Constat | Dump |
|---|---|---|---|---|
| 1 | Structure de `report.playerDetails` | ✅ | Hypothèse correcte **mais doublement imbriquée** : `{ data: { playerDetails: { tanks, healers, dps } } }`. Champs : `name, id, guid, type, server, region, icon, specs, minItemLevel, maxItemLevel, potionUse, healthstoneUse, combatantInfo`. `specs` = `[{spec, count}]`, pas `[string]`. `combatantInfo` **vide** quand on passe `fightIDs`. | `02-playerdetails.json` |
| 2 | Structure d'un event `cast` | ✅ | Exactement `{ timestamp, type, sourceID, targetID, abilityGameID, fight }`. **Le champ `fight` est présent** → bucketing direct par run, pas de fenêtre temporelle. | `03-events-nofilter.json` |
| 3 | Syntaxe de `filterExpression` | ✅ | `type = "cast"` **et** `type = 'cast'` marchent (guillemets indifférents). `ability.id in (…)` marche. Volumes conformes au compte hors-ligne. | `04-filter-test.json` |
| 4 | Format des talents (`CombatantInfo`) | ✅ | `talents` est un **tableau vide** (champ mort). Le vrai contenu est `talentTree` : `[{ id, rank, nodeID }]`, 78 entrées. Aussi utile : `specID` (int), `gear`, `auras`, `pvpTalents`, et toutes les stats. | `05-combatantinfo.json` |
| 5 | Budget sous token utilisateur | ❌ | **Non testé — sans objet.** À ~3 pts par scan sur 3600 pts/h le budget n'est pas contraignant, et les **rapports privés ont été mis hors périmètre**. Le flow authorization code est abandonné ; script conservé à toutes fins utiles : `06-user-token.mjs`. | — |
| 6 | Longueur max de `filterExpression` | ✅ | **Borne nette** : `Σ (chiffres(id) + 4,23) ≲ 7215`, soit ~640 ids à 7 chiffres. Au-delà : `events: null` en HTTP 200, sans erreur. Détail en E8 et E11. | `10-filter-length.json`, `13-filter-budget.json` |

---

## ⚠️ Écarts au plan — à corriger avant la Phase 1

### E1. Les boss ne sont pas des `fights`, ce sont des `dungeonPulls`

C'est la correction la plus lourde. Le §4.3 suppose que `report.fights` contient un fight
de run **et** des fights de boss, à distinguer par `encounterID`. **Faux en Mythic+.**

Dans le rapport témoin, les 9 fights portent tous l'`encounterID` du **donjon**
(112526 = Algeth'ar Academy, 61209 = Skyreach). Aucun fight de boss. Les boss sont dans
`fight.dungeonPulls[]` :

```
fight 3 "Algeth'ar Academy" enc 112526, 10 dungeonPulls :
  pull  1  enc     0  "Vile Lasher"          ← trash
  pull  2  enc  2563  "Overgrown Ancient"    ← BOSS
  pull  6  enc  2564  "Crawth"               ← BOSS
  pull  8  enc  2562  "Vexamus"              ← BOSS
  pull 11  enc  2565  "Echo of Doragosa"     ← BOSS
```

Conséquences :

- **Un boss se détecte par `dungeonPull.encounterID !== 0`**, pas par un fight.
- Le §4.3 disait « croiser avec `worldData.zone().encounters` : si l'id correspond au donjon
  → mode run ». Le croisement fonctionne, mais dans un seul sens : la liste de la zone M+ ne
  contient **que les donjons** (8 entrées pour la zone 55), jamais les boss. Un
  `encounterID` de boss est donc **toujours** absent de cette liste — la consigne « loguer
  tout encounterID absent de la liste » déclencherait sur chaque boss. À reformuler :
  *présent dans la liste = donjon ; absent = boss ou événement scripté.*
- **Il n'existe pas de « mode boss unique »** : l'URL ne peut pointer que sur un fight, donc
  sur une run entière. Le piège #1 disparaît sous cette forme, remplacé par : découper la run
  en boss soi-même.
- **`orderIndex` (§5) est gratuit** : c'est l'index du pull boss dans `dungeonPulls`.
  Attention, `pull.id` a des trous (pas de pull 5) — utiliser l'ordre, pas l'id.
- `dungeonPull` n'expose que `{ id, name, encounterID, startTime, endTime }` — **pas de
  `kill`**. Le seul `kill` est au niveau du fight de run.

### E2. Les noms de boss ne sortent que de `dungeonPull.name`

`worldData.encounter(id: 2563)` → **NULL** pour les quatre boss. Seul le donjon
(`id: 112526`) se résout. La seule source de nom est donc `dungeonPull.name`.

**WCL normalise les noms de PNJ en anglais**, y compris sur un rapport CN — vérifié sur le
témoin :

| Champ | Valeur sur un rapport CN | Localisé ? |
|---|---|---|
| `fight.name`, `fight.gameZone.name` | `Algeth'ar Academy` | non |
| `dungeonPull.name` | `Overgrown Ancient`, `Crawth`, `Vexamus` | non |
| `masterData.actors[].name` (NPC) | `Spellbound Battleaxe`, `Alpha Eagle` | non |
| `masterData.actors[].name` (Pet) | `Lesser Ghoul`, mais aussi `瘟疫嚼碎者` | **partiellement** |
| `playerDetails[].name` | `裂风酱嗷`, `绿绿月光` | **oui** |

→ `dungeonPull.name` est donc directement exploitable comme nom de boss. Mais c'est un
comportement observé sur un seul rapport, pas une garantie documentée — et les pets montrent
que la normalisation n'est pas totale.

→ **Voir E14, qui règle la question** : `gameData.npc(gameID)` donne le nom canonique hors
rapport, via le `gameID` exposé par `masterData.actors`. C'est cette source qu'il faut
utiliser, pas `dungeonPull.name`.

La règle « toujours identifier par `encounterID`, jamais par nom » (§4.3) reste la bonne dans
tous les cas : le nom sert à l'affichage, jamais de clé.

→ Le piège #2 du §7 (« identification des boss par nom → casse sur rapports localisés ») est
moins immédiat que le plan ne le craint, mais reste la bonne discipline.

### E3. Le budget de points n'est pas le facteur limitant

Le §8 annonce : *« Le facteur limitant sera le budget de points et la qualité du parsing. »*
Mesures réelles, une run M+ complète de 30 minutes :

**Le §4.1 tient : 3 requêtes par run, pas 4.** `worldData` et `gameData` sont hors du scan.

| Requête | Points | Fréquence |
|---|---|---|
| `worldData.zones` | 1,00 | **une fois pour toutes**, cachable indéfiniment — hors scan |
| `report.fights` (avec `dungeonPulls`) | 1,00 | 1× par run — cachable par rapport |
| `report.playerDetails` + `masterData.actors` + `.abilities` | 1,00 | 1× par run — un seul call, trois champs |
| `report.events` Casts sans filtre | 2,24 | 1× par run, **× nb de pages** |
| **Total par run** | **4,24** | |
| *idem avec `filterExpression` (1 page)* | *3,00* | |

→ **Capacité horaire : 3600 / 4,24 ≈ 850 runs/h sans filtre**, ~1200/h avec filtre.
Le coût est essentiellement **1 point par page** de 10 000 events ; seule la 3ᵉ requête
scale avec la durée de la run.

Note : `worldData.zones` perd même son rôle du §4.3 (distinguer fight de run et fight de
boss — distinction inexistante, cf. E1). Ce qu'il en reste — nommer le donjon, rattacher à
une saison — est déjà couvert par `report.zone` et `fight.gameZone`, tous deux dans la
requête `fights`. À garder pour le mapping `zoneId → seasonId`, pas plus.

Reste vrai : la qualité du parsing est bien le vrai risque. Le budget, non.

### E3bis. Pagination : `limit` s'applique APRÈS filtrage, et le coût est par page

Mesures sur la fenêtre du fight 3 (dump `09-pagination.json`) :

| Filtre | `limit` | Events | Pages | Points |
|---|---|---|---|---|
| aucun | 10000 | 13 902 | 2 | 2,00 |
| `type = "cast"` | 10000 | 11 743 | 2 | 2,00 |
| `type = "cast" and ability.id in (3 spells)` | 10000 | 76 | **1** | **1,00** |
| idem | 100 | 76 | 1 | 1,21 |
| aucun | 100 | 2505 *(tronqué à 25 pages)* | 25 | **25,00** |

Trois conclusions :

**1. `limit` compte les events RETOURNÉS, pas scannés.** Preuve : le filtre à 3 sorts rend
76 events en **une seule page couvrant 1716 s** — toute la run. Sans filtre à `limit: 100`,
une page ne couvre que ~11 s. Un filtre serré réduit donc réellement le nombre de pages.

**2. Le coût est ~1 point par page, quel que soit son remplissage.** Une page de 76 events
coûte autant qu'une page de 10 000. → **`limit` doit toujours être au maximum.** Le
descendre à 100 multiplie le coût par 12 pour la même donnée.

**3. Le plafond réel est 10 000, appliqué silencieusement.** `limit: 25000` et
`limit: 100000` renvoient 10 000 events sans la moindre erreur — encore un échec muet, dans
la lignée de E5.

Conséquence économique : le seuil qui compte est **10 000 events retournés = 1 page**.
`type = "cast"` seul ne fait pas passer sous la barre (11 743) et n'économise donc **rien**
(2,00 pts dans les deux cas). Seul un filtre sur une liste de sorts y parvient, ramenant le
scan de 4,24 à 3,00 points — soit ~29 %. À mettre en balance avec le risque d'un corpus
incomplet (§5) ; vu que le budget n'est pas contraignant (E3), **ça ne justifie pas de
filtrer**.

⚠️ Détail à ne pas rater en Phase 1 : avec `limit: 100`, plusieurs pages ont renvoyé
**101 events**. WCL ne coupe pas au milieu d'un timestamp. Ne jamais écrire
`assert(data.length <= limit)`.

### E4. Deux types d'events non prévus

Le §2.3 n'annonce que `begincast` et `cast`. Le dump en donne quatre :

```
cast: 11743   begincast: 1911   empowerstart: 125   empowerend: 123
```

`empowerstart`/`empowerend` sont les sorts **empowered** (Évoquateur — un Augmentation est
présent dans le témoin). Filtrer sur `type = 'cast'` reste correct et suffisant, mais un
`type != 'begincast'` serait faux.

### E5. Le `filterExpression` échoue silencieusement **dans les deux sens**

Le §2.2.3 anticipe un mode d'échec (filtre ignoré → volume complet). Il y en a deux, et le
second est pire :

| Expression | Résultat | Verdict |
|---|---|---|
| `type = "cast" and ability.id in (…)` | 5247 events | ✅ exact |
| `type = "cast" and abilityGameID in (…)` | **0 event, aucune erreur** | ☠️ nom de champ invalide → silence total |
| `type = "cast" and source.id > 5` | 10000 (= limite, non filtré) | ☠️ prédicat ignoré silencieusement |
| `source.type = "Pet"` | 0 event | ambigu (voir E6) |

Un nom de champ invalide ne provoque **jamais** d'erreur GraphQL. C'est le piège #7 en pire :
le plan craignait un coût maximal, le vrai risque est un **corpus vide qui a l'air correct**.

→ Le test de non-régression du §2.2.3 doit devenir un **test automatisé permanent**, pas une
vérification de Phase 0 : comparer périodiquement volume filtré vs non filtré sur un log
témoin figé. `04-filter-test.mjs` fait déjà exactement ça.

→ Corollaire : **`ability.id` est le seul nom de champ vérifié**. `abilityGameID` n'existe pas
côté filtre. La note du §2.3 (« deux noms pour la même chose ») est confirmée et critique.

### E6. Les pets n'émettent aucun event dans `dataType: Casts`

Sur les 13 902 events de la run, les `sourceID` sont **exclusivement 1 à 5** — les cinq
joueurs. Or `masterData.actors` liste **23 acteurs avec `petOwner`** (Magus of the Dead,
Abomination, Highlord Darion Mograine pour le DK Unholy ; Chi-Ji, Yu'lon, Jade Serpent Statue
pour le Moine Mistweaver).

→ Bonne nouvelle pour le piège #6 sur ce témoin : rien à réattribuer, les cooldowns
apparaissent bien sous le `sourceID` du joueur.

→ **Confirmé sur un second témoin avec Chaman** — voir E16, le point est clos.
La sonde `source.type = "Pet"` ne tranche rien : elle renvoie 0, mais on ne sait pas
distinguer « aucun pet ne cast » de « prédicat invalide silencieux » (cf. E5).

---

### E8. `filterExpression` : plafond dur vers ~640-700 spell ids, échec silencieux

Le §2.2.6 demandait de tester « si la liste dépasse la centaine ». Elle a une borne nette,
et le mode d'échec est le pire possible.

**Mode d'échec** : au-delà du seuil, l'API renvoie **HTTP 200**, `events: null`, et
**aucun tableau `errors`** :

```json
{"data":{"reportData":{"report":{"events":null}}}}
```

Pas d'exception GraphQL, pas de code HTTP d'erreur. Un client naïf lit `events.data` et
plante, ou pire, traite `null` comme « zéro cast ».

**La borne n'est ni en octets ni en nombre d'ids** — elle dépend des deux. Bourrer
l'expression d'espaces jusqu'à 7000 octets passe sans problème ; c'est la liste d'ids qui
compte. Dichotomies (dump `10-filter-length.json`) :

| Chiffres par id | Dernier `n` accepté | `n × (chiffres + 4,27)` |
|---|---|---|
| 3 | 992 | 7212 |
| 4 | 900 | 7443 |
| 5 | 782 | 7249 |
| 6 | 704 | 7230 |
| 7 | 640 | 7213 |

→ Modèle empirique : **`n × (chiffres + 4,27) ≲ 7215`**. Chaque id coûte ses chiffres plus
~4,3 unités de surcoût fixe.

**En pratique** : les spellId de WoW actuels vont de 5 à 7 chiffres (`42650`, `48707`,
`1233448`). Le plafond réel est donc **entre 640 et 780 ids**, ~700 pour une liste mixte.

⚠️ Une table `SpellReference` couvrant 5 catégories × ~40 specs atterrit précisément dans
cette zone. **Ne pas s'en approcher.**

**Recommandation : ne pas mettre la liste de sorts dans `filterExpression`.**

1. Le gain est de 1,24 point par scan (4,24 → 3,00), sur un budget qui autorise déjà
   850 runs/h. Sans objet (E3).
2. Le §5 recommande déjà de tout stocker, pour l'immunité aux changements de liste.
3. Le filtre a une falaise silencieuse exactement là où la liste va atterrir.

→ Envoyer `type = "cast"` (55 octets, aucun risque) et filtrer contre `SpellReference`
**dans le worker**. La table garde tout son rôle — catégories, noms, icônes, affichage —
elle ne pilote simplement pas la requête API.

→ Si le filtrage API est malgré tout retenu : découper en lots de **400 ids maximum**, et
traiter `events === null` comme une **erreur dure**, jamais comme un résultat vide.
Un lot par requête = un point par lot ; à 3 lots, filtrer coûte plus cher que ne pas filtrer.

### E10. Un seul call pour joueurs **et** boss : `dataType: All`

`HostilityType` n'a que deux valeurs (`Friendlies`, `Enemies`) — pas de « All ». Omettre
l'argument équivaut à `Friendlies`. Mais **`EventDataType` a une valeur `All`, et avec elle
`hostilityType` est purement et simplement ignoré** :

| `dataType` | `hostilityType` | Events | sourceIDs |
|---|---|---|---|
| `Casts` | omis | 76 | `[4]` — joueurs |
| `Casts` | `Friendlies` | 76 | `[4]` |
| `Casts` | `Enemies` | 53 | `[40]` — boss |
| `All` | omis | 482 | `[4, 40]` — **les deux** |
| `All` | `Friendlies` | 482 | `[4, 40]` — argument ignoré |
| `All` | `Enemies` | 482 | `[4, 40]` — argument ignoré |

→ **Ce n'est pas le retrait de `type = "cast"` qui débloque les boss, c'est `dataType: All`.**
Sans `type` mais avec `dataType: Casts`, on reste sur les seuls alliés.

#### Ne PAS ajouter `type = "cast"` au filtre — post-traiter à la place

Liste témoin de 67 spellId (sorts joueurs à écart min ≥ 30 s + abilities de Crawth),
fenêtre du fight 3 complet :

| Filtre sous `dataType: All` | Events | dont `cast` | sourceIDs | Payload | Pages | Pts |
|---|---|---|---|---|---|---|
| `ability.id in (…)` | 2616 | 494 | `-1,1..5,16,29,39,40,41` | 335 Ko | 1 | 1,00 |
| `type = "cast" and ability.id in (…)` | 494 | 494 | `1..5,39,40,41` | 49 Ko | 1 | 1,00 |
| `type in ("cast","begincast") and …` | 523 | 494 | idem | — | 1 | 1,00 |

**Coût identique, 286 Ko d'écart — et le filtre serveur coupe du signal réel.** Pour la même
liste de spellId, `type = "cast"` supprime intégralement trois sources :

```
src -1  Environment          → uniquement des "death"      (7)
src 16  瘟疫嚼碎者 [Pet]        → uniquement des "aurabroken" (8)
src 29  Future Self [Pet]    → uniquement des "aurabroken" (13)
```

Et le détail est instructif :

```json
{"type":"death","sourceID":-1,"abilityGameID":0,"killerID":5,"killingAbilityGameID":322109}
```

`abilityGameID` vaut **0** — cet event a matché le filtre par son `killingAbilityGameID`
(322109 = Touch of Death, présent dans la liste). → **`ability.id` dans une
`filterExpression` ne pointe pas vers un champ fixe : il se résout selon le type d'event**
(`abilityGameID`, `killingAbilityGameID`, `extraAbilityGameID`…). Poser `type = "cast"` en
amont supprime donc des occurrences du sort suivi qui existent sous une autre forme, sans
rien signaler.

→ **Configuration retenue : un seul call,
`dataType: All` + `filterExpression: ability.id in (…)`, tri des types en post-traitement.**
Joueurs et boss ensemble, 1 page, 1 point, le 4ᵉ call de E9 disparaît.

Cohérent avec le reste de cette recon : chaque filtre serveur de cette API a une façon
d'échouer en silence (`abilityGameID` → 0 event, `source.id` → ignoré, `limit: 25000` →
plafonné, liste > ~640 ids → `events: null`). Moins on délègue, mieux on se porte. Et c'est
le principe du §5 : tout ramener, filtrer en code, parce que la liste bougera.

⚠️ Seul point à surveiller : `dataType: All` rend ~5,3 events par cast, donc la pagination
arrive vers **~1900 casts filtrés** au lieu de 10 000. Question de volume, pas de justesse —
et une page de plus coûte 1 point.

**Bénéfice annexe** : sans filtre de type, on récupère `applybuff` / `removebuff` sur les
sorts suivis — la **durée réelle d'activité** d'un défensif, pas seulement l'instant où il
est pressé. Exactement ce qu'il faut pour la zone grisée de la Phase 4 (§6). Ainsi que les
`death` et les `aurabroken`, qui racontent l'issue du cooldown.

### E11. Budget exact d'une `filterExpression`, et garde-fou

Mesure par dichotomie ouverte (dump `13-filter-budget.json`, 77 requêtes) :

| Chiffres par id | `n` max accepté | Octets de la liste |
|---|---|---|
| 3 | 995 | 4973 |
| 4 | 883 | 5296 |
| 5 | 785 | 5493 |
| 6 | 706 | 5646 |
| 7 | 642 | 5776 |

**Ce n'est ni un nombre d'ids ni un nombre d'octets** : les deux varient de 16 à 55 % d'une
ligne à l'autre. Le modèle qui tient est un coût par id :

```
Σ ( chiffres(id) + 4,23 )  ≤  ~7210
```

Ajustement par moindres carrés sur les 5 mesures : **erreur ≤ 0,6 %** (prédit 999 / 878 /
783 / 706 / 643 contre 995 / 883 / 785 / 706 / 642 mesurés).

Validation sur une liste **mixte** de vrais spellId du log (répartition
`{5:24, 6:72, 7:393}` pour 500 ids) : seuil mesuré à **656 ids**, coût calculé 7211 ;
premier refus à 657, coût 7222. → le budget réel est **entre 7211 et 7222**.

**Garde-fou à implémenter :**

```ts
const FILTER_BUDGET = 6500;              // ~7215 mesuré, marge de 10 %
const cost = (ids: number[]) =>
  ids.reduce((s, id) => s + String(id).length + 4.23, 0);

if (cost(spellIds) > FILTER_BUDGET) { /* fallback, voir E12 */ }
```

Capacité au budget recommandé : **702 ids à 5 chiffres, 634 à 6, 577 à 7**. Pour une liste
mixte moderne, tabler sur **~600**.

⚠️ Rappel du mode d'échec (E8) : au-delà, `events: null`, HTTP 200, aucune erreur GraphQL.
Le garde-fou n'est pas une optimisation, c'est la seule protection.

### E12. Le fallback « restreindre aux classes » ne coûte aucun call

Constat : `report.playerDetails` est **déjà** la 2ᵉ requête du flux §4.1, et elle précède
déjà la requête `events`. Elle renvoie pour chaque joueur :

```json
{ "id": 1, "guid": 117350927, "type": "Druid", "specs": [{ "spec": "Guardian", "count": 1 }] }
```

→ classe **et** spec, sans requête supplémentaire. Le fallback est gratuit, et il n'y a
aucune raison de ne pas l'appliquer **systématiquement** plutôt qu'en repli :

| Stratégie | Sorts dans le filtre | Sous budget ? |
|---|---|---|
| Toute la table | ~700 (40 specs) | limite, dépend de la saison |
| Restreint aux 5 classes du groupe | ~150-200 | large |
| Restreint aux 5 **specs** du groupe | ~50-80 | très large |

Restreindre par **spec** plutôt que par classe divise encore par 2 à 3. Le `specID` numérique
est dans `CombatantInfo` (`specID: 104`), la chaîne dans `playerDetails.specs[].spec`.

⚠️ Trois réserves :

1. `specs` est un **tableau** (`[{spec, count}]`) — un joueur peut changer de spec entre deux
   fights d'un même rapport. Prendre l'**union** de toutes les specs listées, jamais la
   première.
2. Les sorts de catégorie `BOSS` ne sont pas rattachables à une classe. Soit on les inclut
   toujours, soit on les restreint par `encounterID` — connu dès la requête `fights`,
   également gratuit.
3. Certains sorts suivis sont **indépendants de la classe** (consommables, trinkets, buffs
   de raid). Prévoir une catégorie « toujours incluse » dans `SpellReference`.

**Impact sur le schéma §5** : `SpellReference` a déjà `className String?`. Ajouter
`specID Int?` (nullable pour les sorts inter-classes et les sorts de boss) suffit. Coût nul,
comme prévu.

### E9. Les sorts de boss exigent une requête séparée — ~~caduc~~, voir E10

`hostilityType: Friendlies` — utilisé partout jusqu'ici — **exclut les boss**. Sur la
fenêtre de Crawth :

| `hostilityType` | Casts | sourceIDs | Abilities |
|---|---|---|---|
| `Friendlies` | 1869 | 1-5 (les joueurs) | 77 |
| `Enemies` | 33 | -1 (Environment), 40 (le boss) | 6 |

→ La catégorie `BOSS` de `SpellReference` ne peut pas être alimentée par la même requête que
les quatre autres. Il faut un **4ᵉ call par rapport** en `hostilityType: Enemies`.

Bonne nouvelle sur le coût : 33 casts sur toute une fenêtre de boss — les casts ennemis
tiennent très largement en une page, donc **+1 point par rapport**, portant le scan complet
à 5,24 points (~690 runs/h). Toujours pas contraignant.

---

### E13. Les talents changent entre deux runs d'un même rapport

Comparaison des `CombatantInfo.talentTree` sur 4 runs du rapport témoin — fights 1 et 3
(Algeth'ar Academy) contre fights 4 et 9 (Skyreach), dump `14-talents-per-run.json` :

| sourceID | f1 | f3 | f4 | f9 | verdict |
|---|---|---|---|---|---|
| 1 | `c9cae137` (78) | `c9cae137` | `2faaeb2e` (78) | `2faaeb2e` | **change** |
| 2 | `a0772d04` (79) | `a0772d04` | `7233d62b` (79) | `7233d62b` | **change** |
| 3 | `a13d66bb` (73) | `a13d66bb` | `93df444f` (73) | `93df444f` | **change** |
| 4 | `4430716e` (77) | `4430716e` | `1ae28e5f` (77) | `1ae28e5f` | **change** |
| 5 | `d9190dfb` (79) | `d9190dfb` | `506acb19` (79) | `506acb19` | **change** |

**5 joueurs sur 5 changent d'arbre entre les deux donjons.** Même nombre de points, même
`specID`, même équipement (0/5 changent de gear) — seule l'allocation diffère. Les joueurs se
re-talentent par donjon, comportement attendu en M+.

→ **Le `talentTree` impose le grain RUN pour l'association joueur ↔ run ↔ spec.** La spec
seule ne l'aurait pas révélé : `specID` est resté identique (104, 1473, 1480, 252, 270) sur
les 4 runs. Une association au grain *rapport* écraserait deux builds distincts en un.

→ `playerDetails[].specs` est bien un tableau avec `count` (10, 9, 9, 10 sur 10 fights) —
deux joueurs manquent d'un fight. Le roster varie aussi par run, ce qui confirme le grain.

### E14. `gameData` : le référentiel se seede presque entièrement depuis l'API

Découvert tardivement, ce namespace annule l'essentiel du travail de seed manuel que les
notes précédentes annonçaient (E2 notamment, à lire avec cette correction).

**Champs disponibles** : `ability(id)`, `abilities(limit,page)`, `classes(...)`, `npc(id)`,
`zone(id)`, `item(id)`, `affix(id)`, `enchant(id)`, `map(id)`, plus leurs formes paginées.

| Besoin | Requête | Coût mesuré |
|---|---|---|
| Nom + icône d'un sort, **hors rapport** | `gameData.ability(id) { id name icon }` | **200 alias = 1 pt**, 500 = 2 pts |
| Classes et specs | `gameData.classes { id name slug specs { id name slug } }` | 1 pt (13 classes, 40 specs) |
| Nom canonique d'un boss | `gameData.npc(gameID) { id name }` | 1 pt / lot |
| Abilities d'un rapport | `masterData.abilities { gameID name icon type }` | 0 (déjà dans la requête roster) |

⚠️ **Correction (relevée par Zod en Phase 1)** : `ability.type` est une **chaîne**, pas un
nombre — `"0"`, `"1"`, `"96"` sur les 787 entrées. Les traces de Phase 0 affichaient
`type=32` sans guillemets, ce qui prêtait à confusion. C'est l'école de magie.

**Le lookup fonctionne hors rapport** — vérifié sur `6673` Battle Shout, `871` Shield Wall,
`47536` Rapture, `1719` Recklessness, tous absents du log témoin. Seeder 700 sorts coûte donc
~3 points.

⚠️ **Ne jamais dumper `gameData.abilities(limit, page)`** : `total = 457 369`,
`last_page = 4574`. Le catalogue complet coûterait ~4574 points pour de la donnée dont 99 %
est inutile (`"Word of Recall (OLD)"`, entrées de nom `null`…).

⚠️ **`GameSpec.id` n'est pas le `specID` Blizzard.** C'est un index par classe, et il est
troué :

```
  8 Rogue → 1:Assassination, 3:Subtlety, 4:Outlaw     ← pas de 2
  2 Druid → 1:Balance, 2:Feral, 3:Guardian, 4:Restoration
```

Guardian vaut `3` ici, `104` dans `CombatantInfo.specID`. Le pont entre les deux est le
**nom**. Il s'apprend aussi tout seul au scan, puisque `CombatantInfo.specID` et
`playerDetails[].specs[].spec` décrivent le même joueur dans la même requête.

**Les noms de boss ont finalement une source** (corrige E2) : `masterData.actors` expose les
acteurs `subType: "Boss"` avec leur `gameID` Blizzard, et `gameData.npc(gameID)` en donne le
nom canonique — identique à `dungeonPull.name` sur les 4 boss du témoin :

```
  gameID 196482 → "Overgrown Ancient"
  gameID 191736 → "Crawth"
  gameID 194181 → "Vexamus"
  gameID 190609 → "Echo of Doragosa"
```

`npcGameId` est en outre **indépendant de la saison**, contrairement aux `encounterID`. Il
sert de parade si les encounterID de boss s'avéraient saisonniers comme ceux des donjons.

### E15. Les icônes : nom de fichier côté API, octets côté CDN

`Spell.icon` est un nom de fichier Blizzard (`spell_deathknight_armyofthedead.jpg`), jamais
une URL. Trois CDN le servent, tous vérifiés en 200. **Retenu : Blizzard, first-party.**

```
https://render.worldofwarcraft.com/us/icons/{18|36|56}/{icon}
```

| Point | Constat |
|---|---|
| Tailles | `18` (1,0 Ko), `36` (1,8 Ko), `56` (2,9 Ko) |
| Régions | `us`, `eu`, `kr`, `tw` identiques — **`cn` renvoie 403** |
| Extension | `.jpg` obligatoire : sans elle, 403 |
| Icône inexistante | **403, pas 404**, corps `application/xml` |

⚠️ Le 403 sur icône manquante impose un `onError` côté front : le navigateur reçoit du XML là
où il attend une image, et rien ne distingue « absente » de « interdite ».

Écartés : `assets.rpglogs.com` (CDN de WCL, viable mais second choix) et `wow.zamimg.com`
(Wowhead, tiers non sollicité). L'art reste propriété de Blizzard — point licence à vérifier
avant mise en ligne publique, pas avant d'écrire le code.

### E16. Piège des entités intermédiaires : clos

Deux témoins, dont `KangZwt8TAYhmLfz` fight 15 avec un Chaman Restauration : **53 acteurs
`petOwner` au total, zéro cast émis par l'un d'eux**. Poser un totem est un cast du joueur —
Healing Tide Totem (108280) sort bien sous le `sourceID` du Chaman, avec un `summon` associé.

Les entités intermédiaires émettent des events (`aurabroken`, `damage`, `summon`) mais jamais
de `cast`. **Décision : aucun des sorts suivis n'est émis par un pet ou un totem.** Le point
est fermé, la réattribution `petOwner` retirée du plan.

## Sémantique confirmée (§2.3)

- ✅ `event.timestamp` relatif au rapport — premier cast à `3 215 155`
- ✅ `fight.startTime` relatif au rapport — fight 3 à `3 207 433`
- ✅ `report.startTime` absolu — `1 785 766 970 214` (epoch ms)
- ✅ `offsetBoss = event.timestamp - pull.startTime` donne bien des valeurs dans `[0, durée]`
- ✅ `abilityGameID` dans les events / `ability.id` dans les filtres — confirmé, et `abilityGameID` en filtre renvoie 0 sans erreur (E5)
- ✅ `dataType: Casts` renvoie `begincast` + `cast` (+ `empowerstart`/`empowerend`, E4)
- ✅ `hostilityType: Friendlies` limite bien aux 5 joueurs

## Identification des boss

- Zone du rapport témoin : **47 — Mythic+ Season 1** (le rapport est d'une saison passée ;
  la zone courante est **55 — Mythic+ Season 2**). → **La zone doit venir de `report.zone.id`,
  jamais d'une constante.** `seasonId` du §5 se dérive de là.
- encounterID du donjon : `112526` (Algeth'ar Academy) — présent dans `worldData.zone(47)`
- encounterID des boss : `2563`, `2564`, `2562`, `2565` — absents de toute liste worldData
- `gameZone.id` = `2526` — l'id d'instance Blizzard, distinct de l'encounterID du donjon
- `keystoneAffixes` = `[10, 9, 147]`, `keystoneLevel` = 24, `keystoneTime` = 1 764 654 ms,
  `keystoneBonus` = 1 — tous disponibles au niveau du fight

## Répartition des casts (fight 3, 11 743 casts `type='cast'`)

| # | pull | encounterID | nom | départ | durée | casts |
|---|---|---|---|---|---|---|
| 0 | 2 | 2563 | Overgrown Ancient | +124,4 s | 192,6 s | 1451 |
| 1 | 6 | 2564 | Crawth | +597,6 s | 263,5 s | 1869 |
| 2 | 8 | 2562 | Vexamus | +1073,4 s | 210,7 s | 1422 |
| 3 | 11 | 2565 | Echo of Doragosa | +1489,8 s | 282,3 s | 1936 |

**6678 casts en combat de boss, 5065 hors boss** (trash et déplacements). Le trash
représente 43 % des casts — à conserver si on veut un jour montrer la route complète.

## Volume et stockage — décision « filtrer ou tout stocker » (§5)

| Forme | Taille |
|---|---|
| Events bruts (13 902, tous types) | 1435 Ko |
| `type='cast'` seuls (11 743) | 1218 Ko |
| Compacté `[timestamp, sourceID, abilityGameID]` | **220 Ko** |

→ **Recommandation : tout stocker, sous forme compactée.** 220 Ko par run en JSONB, contre
1218 Ko en objets nommés — un facteur 5,5 pour zéro perte d'information. Le plan
recommandait déjà « tout stocker » ; la mesure le confirme largement (le coût marginal est
de 1,24 point et ~200 Ko), et `spellSetVersion` reste alors facultatif.

⚠️ Corollaire du §5 déjà anticipé : à 220 Ko par ligne, **jamais de `SELECT *`** sur les
requêtes de listing.

## Impact sur le schéma §5

- `ScannedFight.@@id([reportCode, fightID])` **ne tient plus** : les 4 boss d'une run
  partagent le même `fightID`. Clé à passer en `[reportCode, fightID, orderIndex]`
  (ou ajouter `pullId`).
- `runFightID` devient égal à `fightID` — le fight *est* la run. Champ probablement à fusionner.
- `orderIndex` : dérivé de la position dans `dungeonPulls` filtrés sur `encounterID !== 0`.
- `FightParticipant.talents` : stocker `talentTree` (`[{id, rank, nodeID}]`), pas `talents`.
  Ajouter `specID` (int) — plus fiable que la chaîne `spec`.
- `Character` : ajouter `region` (présent dans `playerDetails`, `"CN"` ici) — le couple
  `name + server` n'est pas unique inter-régions.
- `kill` n'existe qu'au niveau run : une colonne `kill` par boss serait un mensonge. Ce qui
  existe, c'est `keystoneBonus` (nombre de chronos) au niveau run.

---

## E7. Le cooldown réel est dérivable du corpus — `cooldownSec` n'a pas à être saisi

Test sur trois cooldowns de Death Knight demandés en cours de recon
(`type = "cast" and ability.id in (42650, 1233448, 48707)`, dump `08-three-spells.json`) :
**76 casts attendus par comptage hors-ligne, 76 obtenus par le filtre.**

| spell | casts | écart **min** | écart médian | écart max |
|---|---|---|---|---|
| 42650 (Army of the Dead) | 18 | **90,0 s** | 91,5 s | 136,2 s |
| 1233448 | 35 | **45,0 s** | 45,5 s | 90,5 s |
| 48707 (Anti-Magic Shell) | 23 | **42,0 s** | 56,5 s | 328,0 s |

Les trois sont émis par le seul `sourceID` 4 (l'Unholy DK) — cohérent.

**L'écart minimum entre deux casts d'un même sort par un même joueur est son cooldown
réel**, réductions de talents et haste comprises. Le §5 décrit `cooldownSec` comme
« saisi manuellement, approximatif » et le §6/Phase 4 en fait une réserve (« à présenter
comme une aide visuelle, jamais comme un verdict »).

→ Il devient **mesurable** : `min(delta)` sur l'ensemble du corpus, par `(spellId, specID)`
voire par build de talents. Plus juste qu'une constante codée en dur, et auto-corrigé à
chaque patch. La zone grisée « cooldown disponible mais non utilisé » de la Phase 4 devient
défendable.

⚠️ Réserves : il faut un `n` suffisant (un sort lancé 2 fois ne dit rien), et la mesure
capture le cooldown le plus court observé — donc le build le plus réducteur, pas celui du
joueur affiché. Segmenter par `talentTree` si on veut être exact.

Note d'exploitation : l'écart médian ≈ écart min pour 42650 et 1233448 → ces sorts sont
relancés dès disponibilité. Pour 48707 (médian 56,5 s pour un CD de 42 s, max 328 s) l'écart
raconte l'usage réactif d'un défensif. **C'est exactement le signal que l'outil doit rendre
visible.**

---

## Validation croisée obligatoire (§6) — ⏳ RESTE À FAIRE

> *« Compter manuellement les casts d'un sort sur le site WCL et comparer avec le résultat
> de l'API. Un `sourceID` mal résolu produit zéro résultat sans erreur. »*

Candidats mesurés côté API sur fight 3, à confronter au site :

| Joueur | sourceID | Sort (id) | Compté via l'API | Compté sur le site | Verdict |
|---|---|---|---|---|---|
| 裂风酱嗷 (Guardian Druid) | 1 | — | | | |
| Mjtdknight (Unholy DK) | 4 | — | | | |
| 绿绿月光 (Mistweaver Monk) | 5 | — | | | |

Sorts les plus fréquents pour référence : `1223412` ×3886, `8921` ×803, `55090` ×558,
`1217610` ×539, `395160` ×513.

**Tant que cette table n'est pas remplie, la Phase 0 n'est pas close** — c'est le seul filet
contre le pire mode d'échec du système.

## Reste ouvert

1. ⏳ Validation croisée manuelle sur le site (ci-dessus)
3. ✅ ~~Table de référence `encounterID → nom de boss`~~ — non nécessaire, `dungeonPull.name`
   revient en anglais même sur un rapport CN (E2). À reconfirmer sur un rapport d'une autre
   région avant de s'y fier en production.
4. ⏸️ Flow authorization code — seulement si on veut lire les rapports privés (E3)
5. ⏳ Liste des sorts à ≥ 30 s de cooldown → `SpellReference`. 125 `abilityGameID` distincts
   sur cette seule run. **`cooldownSec` n'a plus besoin de source externe** : il se dérive
   du corpus par `min(delta)` (E7). Reste à trouver noms et icônes — `SpellReference.name`
   et `.icon` n'ont aucune source côté WCL v2 (les `auras` de `CombatantInfo` en donnent
   quelques-uns au passage, mais localisés).
