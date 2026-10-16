# Feuille de validation croisée — Phase 0

> Dernier point bloquant du §6. Compter **à la main sur le site WCL** et confronter aux
> comptes de l'API ci-dessous. Un `sourceID` mal résolu produit zéro résultat sans erreur :
> c'est le seul contrôle qui l'attrape.

**Rapport** : `TaqLH6KvWAG3XVP8` — fight 3, Algeth'ar Academy +24, 1772 s

Sur le site : onglet **Casts**, sélectionner le joueur dans *Source*, puis le sort.
Les liens ci-dessous pré-sélectionnent les deux.

## Comptes sur la run entière

| Joueur | Spec | Sort | id | Écart min | Casts (API) | Casts (site) | ✓ |
|---|---|---|---|---|---|---|---|
| 裂风酱嗷 | Guardian Druid | [Sundering Roar](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=1&ability=1253799) | `1253799` | 61s | **24** | | |
| 裂风酱嗷 | Guardian Druid | [Light's Potential](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=1&ability=1236616) | `1236616` | 301s | **6** | | |
| 黑川茜龙龙 | Augmentation Evoker | [Beacon of Lightblind Wrath](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=2&ability=1258283) | `1258283` | 92s | **16** | | |
| 黑川茜龙龙 | Augmentation Evoker | [Zephyr](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=2&ability=374227) | `374227` | 133s | **5** | | |
| Milkdemon | Devourer DemonHunter | [Nullsight](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=3&ability=1260459) | `1260459` | 91s | **16** | | |
| Milkdemon | Devourer DemonHunter | [Potion of Recklessness](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=3&ability=1236994) | `1236994` | 308s | **6** | | |
| Mjtdknight | Unholy DeathKnight | [Anti-Magic Shell](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=4&ability=48707) | `48707` | 42s | **23** | | |
| Mjtdknight | Unholy DeathKnight | [Potion of Recklessness](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=4&ability=1236994) | `1236994` | 300s | **6** | | |
| 绿绿月光 | Mistweaver Monk | [Beacon of Lightblind Wrath](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=5&ability=1258283) | `1258283` | 91s | **17** | | |
| 绿绿月光 | Mistweaver Monk | [Light's Potential](https://www.warcraftlogs.com/reports/TaqLH6KvWAG3XVP8#fight=3&type=casts&source=5&ability=1236616) | `1236616` | 300s | **6** | | |

## Comptes par fenêtre de boss

C'est le découpage `dungeonPulls` qui est testé ici, pas seulement la résolution du
`sourceID`. **Trois ou quatre lignes suffisent** — inutile de tout dépouiller. Prends de
préférence des lignes sur des boss différents.

Sur le site, restreindre à une fenêtre de boss : dans l'onglet Casts, la barre de temps sous
le graphe permet de sélectionner un intervalle. Les offsets ci-dessous sont **relatifs au
début de la run**.

| Boss | Fenêtre (offset run) | Joueur | Sort | Casts (API) | Casts (site) | ✓ |
|---|---|---|---|---|---|---|
| #0 Overgrown Ancient | +124s → +317s | 裂风酱嗷 | Sundering Roar | **3** | | |
| #0 Overgrown Ancient | +124s → +317s | 黑川茜龙龙 | Beacon of Lightblind Wrath | **2** | | |
| #0 Overgrown Ancient | +124s → +317s | Milkdemon | Nullsight | **2** | | |
| #0 Overgrown Ancient | +124s → +317s | Mjtdknight | Anti-Magic Shell | **3** | | |
| #0 Overgrown Ancient | +124s → +317s | 绿绿月光 | Beacon of Lightblind Wrath | **2** | | |
| #1 Crawth | +598s → +861s | 裂风酱嗷 | Sundering Roar | **3** | | |
| #1 Crawth | +598s → +861s | 裂风酱嗷 | Light's Potential | **1** | | |
| #1 Crawth | +598s → +861s | 黑川茜龙龙 | Beacon of Lightblind Wrath | **3** | | |
| #1 Crawth | +598s → +861s | 黑川茜龙龙 | Zephyr | **1** | | |
| #1 Crawth | +598s → +861s | Milkdemon | Nullsight | **2** | | |
| #1 Crawth | +598s → +861s | Milkdemon | Potion of Recklessness | **1** | | |
| #1 Crawth | +598s → +861s | Mjtdknight | Anti-Magic Shell | **6** | | |
| #1 Crawth | +598s → +861s | Mjtdknight | Potion of Recklessness | **1** | | |
| #1 Crawth | +598s → +861s | 绿绿月光 | Beacon of Lightblind Wrath | **3** | | |
| #1 Crawth | +598s → +861s | 绿绿月光 | Light's Potential | **1** | | |
| #2 Vexamus | +1073s → +1284s | 裂风酱嗷 | Sundering Roar | **3** | | |
| #2 Vexamus | +1073s → +1284s | 黑川茜龙龙 | Beacon of Lightblind Wrath | **2** | | |
| #2 Vexamus | +1073s → +1284s | 黑川茜龙龙 | Zephyr | **2** | | |
| #2 Vexamus | +1073s → +1284s | Milkdemon | Nullsight | **2** | | |
| #2 Vexamus | +1073s → +1284s | Milkdemon | Potion of Recklessness | **1** | | |
| #2 Vexamus | +1073s → +1284s | Mjtdknight | Anti-Magic Shell | **4** | | |
| #2 Vexamus | +1073s → +1284s | Mjtdknight | Potion of Recklessness | **1** | | |
| #2 Vexamus | +1073s → +1284s | 绿绿月光 | Beacon of Lightblind Wrath | **2** | | |
| #2 Vexamus | +1073s → +1284s | 绿绿月光 | Light's Potential | **1** | | |
| #3 Echo of Doragosa | +1490s → +1772s | 裂风酱嗷 | Sundering Roar | **5** | | |
| #3 Echo of Doragosa | +1490s → +1772s | 裂风酱嗷 | Light's Potential | **1** | | |
| #3 Echo of Doragosa | +1490s → +1772s | 黑川茜龙龙 | Beacon of Lightblind Wrath | **3** | | |
| #3 Echo of Doragosa | +1490s → +1772s | Milkdemon | Nullsight | **3** | | |
| #3 Echo of Doragosa | +1490s → +1772s | Milkdemon | Potion of Recklessness | **1** | | |
| #3 Echo of Doragosa | +1490s → +1772s | Mjtdknight | Anti-Magic Shell | **1** | | |
| #3 Echo of Doragosa | +1490s → +1772s | Mjtdknight | Potion of Recklessness | **1** | | |
| #3 Echo of Doragosa | +1490s → +1772s | 绿绿月光 | Beacon of Lightblind Wrath | **3** | | |
| #3 Echo of Doragosa | +1490s → +1772s | 绿绿月光 | Light's Potential | **1** | | |

## Totaux de contrôle

| Mesure | API |
|---|---|
| Events tous types sur la run | 13902 |
| dont `type = 'cast'` | 11743 |
| `abilityGameID` distincts | 125 |
| `sourceID` distincts | 1, 2, 3, 4, 5 |
| Boss détectés | 4 — Overgrown Ancient, Crawth, Vexamus, Echo of Doragosa |

## Critère de sortie

Toutes les lignes ✓. **Un seul écart invalide le pipeline** : soit la résolution du
`sourceID`, soit le découpage en fenêtres de boss, soit le filtre.
