/**
 * Réalignement des cooldowns de réaction sur le sort de boss qui les a provoqués.
 *
 * En M+, un défensif personnel, un externe ou un cooldown de soin n'est presque jamais
 * lancé au hasard : c'est une réponse à un événement du boss, déclenchée quelques secondes
 * AVANT les dégâts. Ce délai varie d'un joueur et d'un sort à l'autre, si bien que des
 * réactions au même événement se dispersent sur la timeline. On les ramène sur l'instant
 * du sort de boss pour qu'elles forment une colonne lisible.
 *
 * ⚠️ C'est un mensonge d'AFFICHAGE, assumé. Le timestamp réel n'est jamais écrasé : cette
 * fonction rend un offset supplémentaire, et l'appelant expose les deux. `cooldownSec` est
 * mesuré sur les écarts entre casts réels (NOTES E7) — un offset aligné qui y fuiterait le
 * fausserait en silence.
 *
 * Calculé à la LECTURE et non au scan : toutes les entrées vivent dans la même ligne
 * `scanned_boss`, la fenêtre n'est pas stabilisée, et la curation d'`allowedInPlan` bouge
 * encore. Figer le résultat imposerait un re-scan du corpus à chaque ajustement.
 */

/** Catégories dont un cast compte comme réponse à un événement de boss. */
export const RESPONSE_CATEGORIES: ReadonlySet<string> = new Set(['PERSONAL', 'EXTERNAL', 'HEALER']);

/**
 * Rattachement d'une réponse à une capacité de boss : ce que fait le sort du JOUEUR
 * (`effect`) croisé avec ce que fait la capacité (`damageType`). On ne garde que les
 * rattachements qui ont un sens, classés par pertinence :
 *
 * | Sort du joueur → | SHIELD / DR              | HEALING                                   |
 * |------------------|--------------------------|-------------------------------------------|
 * | capacité devant  | niveau 1                 | niveau 1 dans `ANTICIPATION_MS`, sinon 2  |
 * | dot en cours     | niveau 1                 | niveau 1                                  |
 * | burst derrière   | EXCLU : ne protège de rien | niveau 2 (soin de rattrapage)           |
 *
 * Le meilleur niveau l'emporte, puis la capacité la plus proche ; à égalité, celle devant.
 * Les scans portent sur les meilleurs joueurs : chaque cast est présumé intentionnel, d'où
 * le refus net des interprétations absurdes (un bouclier posé après le coup).
 *
 * « Dot en cours » : la DERNIÈRE capacité passée, si c'est un dot, dans `DOT_WINDOW_MS`.
 * Dès qu'une autre capacité est passée, le dot n'explique plus la réponse. Sa durée réelle
 * n'est pas encore modélisée : une fenêtre fixe en tient lieu.
 */
export const ANTICIPATION_MS = 3_000;
export const DOT_WINDOW_MS = 12_000;
/** Portée maximale, devant comme derrière : au-delà, aucune réponse n'est présumée. */
export const WINDOW_AHEAD_MS = 12_000;
export const WINDOW_BEHIND_MS = 12_000;

/**
 * Les défensifs personnels des tanks ne s'alignent sur rien : ils sont largement
 * rotationnels, et leur alignement n'est pas utile (pas même sur un tankbuster). Mesuré
 * sur le corpus, Demoralizing Shout revient toutes les 23 à 33 s — un usage dès que c'est
 * prêt, que la règle ne décrit pas.
 */
export const EXCLUDED_ROLES: ReadonlySet<string> = new Set(['tank']);

/**
 * Catégories qui échappent à l'exclusion de rôle.
 *
 * Un externe est par définition lancé SUR quelqu'un d'autre, en réponse à une menace qui
 * le vise : un tank qui lance Rallying Cry réagit, il ne déroule pas sa rotation. L'exclure
 * pour la seule raison qu'il tanke perdrait des casts pleinement réactifs — 3 sur cette
 * run. L'exclusion doit donc porter sur le couple rôle × catégorie, jamais sur le rôle seul.
 */
export const ROLE_EXEMPT_CATEGORIES: ReadonlySet<string> = new Set(['EXTERNAL']);

export interface AlignableCast {
  offsetBoss: number;
  sourceID: number;
  abilityGameID: number;
}

export interface SpellFacts {
  category: string | null;
  /** Requalification par spec du lanceur : Emerald Blossom soigne en Preservation, protège ailleurs. */
  bySpec?: Record<number, string>;
  /** Seuls les sorts de boss ainsi flagués servent d'ancre. */
  allowedInPlan: boolean;
  /** Sorts de boss : `burst` ou `dot`. Absent = `burst`, le comportement historique. */
  damageType?: string;
  /** Sorts de joueur : `HEALING`, `SHIELD` ou `DR`. Sans lui, pas de rattachement. */
  effect?: string;
}

export interface AlignContext {
  /** sourceID → rôle. Une source absente de cette table est un boss. */
  roleBySource: ReadonlyMap<number, string | null>;
  /** sourceID → specID Blizzard, la catégorie en dépend. */
  specBySource: ReadonlyMap<number, number>;
  spells: ReadonlyMap<number, SpellFacts>;
}

/** Même résolution que le front : la requalification par spec prime sur la catégorie de base. */
function categoryOf(facts: SpellFacts | undefined, specId: number | undefined): string | null {
  if (!facts) return null;
  return (specId != null ? facts.bySpec?.[specId] : undefined) ?? facts.category;
}

/** Premier index dont l'offset est ≥ `offset` (borne inférieure). */
function lowerBound(offsets: readonly number[], offset: number): number {
  let lo = 0;
  let hi = offsets.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid]! < offset) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Index de l'ancre retenue pour une réponse à `offset`, ou `null`. Voir l'ordre de
 * recherche au-dessus de `ANTICIPATION_MS`.
 *
 * ⚠️ Rend un INDEX, pas un offset. Deux ancres peuvent partager le même instant — un boss
 * et un add qui lancent à la même milliseconde — et elles ne portent alors ni le même
 * sort ni le même rang d'occurrence. Repasser par l'offset pour les retrouver en écraserait
 * une, et l'export attribuerait le cast à la mauvaise capacité.
 */
function pickAnchor(
  anchors: readonly Anchor[],
  offsets: readonly number[],
  offset: number,
  effect: string,
): number | null {
  const ahead = lowerBound(offsets, offset);
  const behind = ahead - 1;
  const preventive = effect === 'SHIELD' || effect === 'DR';
  /** [index, niveau, écart] des candidats retenus. */
  const options: Array<[number, number, number]> = [];

  if (ahead < anchors.length) {
    const gap = offsets[ahead]! - offset;
    if (gap <= WINDOW_AHEAD_MS) options.push([ahead, preventive || gap <= ANTICIPATION_MS ? 1 : 2, gap]);
  }
  if (behind >= 0) {
    const gap = offset - offsets[behind]!;
    if (anchors[behind]!.damageType === 'dot') {
      if (gap <= DOT_WINDOW_MS) options.push([behind, 1, gap]);
    } else if (!preventive && gap <= WINDOW_BEHIND_MS) {
      options.push([behind, 2, gap]);
    }
  }
  if (options.length === 0) return null;
  // Meilleur niveau, puis écart le plus court ; le tri est stable, donc devant gagne l'égalité.
  options.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
  return options[0]![0];
}

/**
 * L'ancre retenue pour un cast, décrite entièrement.
 *
 * `occurrence` est le rang chronologique de CE sort de boss dans la fenêtre (1 = premier).
 * C'est la moitié de la clé d'occurrence du format ECP (`<spellID>:<n>`) — l'alignement
 * d'affichage n'en a besoin que de l'offset, l'export a besoin des trois.
 */
export interface Anchor {
  offsetBoss: number;
  spellId: number;
  occurrence: number;
  /** `burst` ou `dot` : décide si les réponses s'y rattachent avant ou après. */
  damageType: string;
}

/**
 * Rend, pour chaque cast dans l'ordre reçu, l'ancre retenue — ou `null` quand le cast
 * n'est pas alignable ou qu'aucune ancre ne tombe dans la fenêtre.
 *
 * Un `null` n'est pas un échec : un défensif brûlé sur du rot ou en préventif n'a
 * légitimement aucune ancre, et doit rester là où il a réellement été lancé.
 */
export function resolveAnchors(
  casts: readonly AlignableCast[],
  ctx: AlignContext,
): Array<Anchor | null> {
  const anchors: Anchor[] = [];
  /** Compteur par sort : le rang ne se compte que sur les casts du MÊME sort de boss. */
  const seen = new Map<number, number>();
  // Trié par instant : le rang chronologique ne dépend pas de l'ordre de stockage.
  for (const c of [...casts].sort((a, b) => a.offsetBoss - b.offsetBoss)) {
    // Une source hors roster est un boss — même règle qu'en base.
    if (ctx.roleBySource.has(c.sourceID)) continue;
    const facts = ctx.spells.get(c.abilityGameID);
    if (facts?.category !== 'BOSS' || !facts.allowedInPlan) continue;
    // Évitable ou sans intérêt : rien à quoi répondre, jamais une ancre.
    if (facts.damageType === 'dodge' || facts.damageType === 'ignore') continue;
    const n = (seen.get(c.abilityGameID) ?? 0) + 1;
    seen.set(c.abilityGameID, n);
    anchors.push({ offsetBoss: c.offsetBoss, spellId: c.abilityGameID, occurrence: n, damageType: facts.damageType ?? 'burst' });
  }
  if (anchors.length === 0) return casts.map(() => null);

  /**
   * Qui répond à quoi. Un tankbuster ne frappe que le tank : seul un externe lancé sur lui
   * y répond — jamais un cooldown de groupe ni le défensif personnel d'un autre joueur.
   * Les défensifs personnels du tank, eux, ne s'alignent sur rien (décision : inutile).
   *
   * Deux sous-listes calculées une fois, triées par instant : les index de la recherche
   * dichotomique y renvoient directement, sans passer par une table qui confondrait deux
   * ancres simultanées.
   */
  const pool = (keep: (a: Anchor) => boolean) => {
    const list = anchors.filter(keep);
    return { list, offsets: list.map((a) => a.offsetBoss) };
  };
  const group = pool((a) => a.damageType !== 'tankbuster');
  const everything = pool(() => true);

  return casts.map((c) => {
    const role = ctx.roleBySource.get(c.sourceID);
    if (role === undefined) return null; // un boss ne s'aligne pas sur lui-même

    const cat = categoryOf(ctx.spells.get(c.abilityGameID), ctx.specBySource.get(c.sourceID));
    if (cat === null || !RESPONSE_CATEGORIES.has(cat)) return null;

    // Sans effet déclaré, on ne sait pas dans quel sens chercher : pas de rattachement.
    const effect = ctx.spells.get(c.abilityGameID)?.effect;
    if (!effect) return null;

    const external = ROLE_EXEMPT_CATEGORIES.has(cat);
    // Défensifs personnels du tank : trop rotationnels, et leur alignement n'est pas utile.
    if (role !== null && EXCLUDED_ROLES.has(role) && !external) return null;
    // Un externe vise un allié précis : il répond aussi bien à un tankbuster qu'au groupe.
    const p = external ? everything : group;
    const i = pickAnchor(p.list, p.offsets, c.offsetBoss, effect);
    return i === null ? null : p.list[i] ?? null;
  });
}

/** Vue réduite pour l'affichage : seul l'instant de l'ancre compte pour recaler une icône. */
export function alignedOffsets(
  casts: readonly AlignableCast[],
  ctx: AlignContext,
): Array<number | null> {
  return resolveAnchors(casts, ctx).map((a) => a?.offsetBoss ?? null);
}
