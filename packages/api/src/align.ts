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
 * `scanned_boss`, la fenêtre n'est pas stabilisée, et la curation d'`inTimeline` bouge
 * encore. Figer le résultat imposerait un re-scan du corpus à chaque ajustement.
 */

/** Catégories dont un cast compte comme réponse à un événement de boss. */
export const RESPONSE_CATEGORIES: ReadonlySet<string> = new Set(['PERSONAL', 'EXTERNAL', 'HEALER']);

/**
 * Le joueur lance AVANT les dégâts : on cherche d'abord devant, et l'arrière ne sert que
 * de repli. Mesuré sur le corpus : délai médian +1,49 s.
 *
 * L'arrière reste néanmoins large — une réaction peut partir bien après le début du sort
 * de boss, notamment un soin de rattrapage une fois les dégâts encaissés. Comme la
 * recherche avant est prioritaire, l'élargir ne détourne aucun cast qui avait déjà une
 * ancre devant lui : ça ne touche QUE les casts jusqu'ici non alignés.
 */
export const WINDOW_AHEAD_MS = 6_000;
export const WINDOW_BEHIND_MS = 5_000;

/**
 * Les tanks sont exclus : leurs défensifs PERSONNELS sont largement rotationnels. Mesuré
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
  inTimeline: boolean;
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
 * Index de la première ancre à `offset` ou après, dans la limite avant.
 *
 * ⚠️ Rend un INDEX, pas un offset. Deux ancres peuvent partager le même instant — un boss
 * et un add qui lancent à la même milliseconde — et elles ne portent alors ni le même
 * sort ni le même rang d'occurrence. Repasser par l'offset pour les retrouver en écraserait
 * une, et l'export attribuerait le cast à la mauvaise capacité.
 */
function firstAhead(offsets: readonly number[], offset: number): number | null {
  const i = lowerBound(offsets, offset);
  const a = offsets[i];
  return a !== undefined && a - offset <= WINDOW_AHEAD_MS ? i : null;
}

/** Index de la dernière ancre strictement avant `offset`, dans la limite arrière. */
function lastBehind(offsets: readonly number[], offset: number): number | null {
  const i = lowerBound(offsets, offset) - 1;
  const a = offsets[i];
  return a !== undefined && offset - a <= WINDOW_BEHIND_MS ? i : null;
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
    if (facts?.category !== 'BOSS' || !facts.inTimeline) continue;
    const n = (seen.get(c.abilityGameID) ?? 0) + 1;
    seen.set(c.abilityGameID, n);
    anchors.push({ offsetBoss: c.offsetBoss, spellId: c.abilityGameID, occurrence: n });
  }
  if (anchors.length === 0) return casts.map(() => null);

  // `anchors` est déjà trié par instant : les index de la recherche dichotomique y renvoient
  // directement, sans passer par une table qui confondrait deux ancres simultanées.
  const offsets = anchors.map((a) => a.offsetBoss);

  return casts.map((c) => {
    const role = ctx.roleBySource.get(c.sourceID);
    if (role === undefined) return null; // un boss ne s'aligne pas sur lui-même

    // La catégorie se résout AVANT le rôle : l'exclusion en dépend.
    const cat = categoryOf(ctx.spells.get(c.abilityGameID), ctx.specBySource.get(c.sourceID));
    if (cat === null || !RESPONSE_CATEGORIES.has(cat)) return null;
    if (role !== null && EXCLUDED_ROLES.has(role) && !ROLE_EXEMPT_CATEGORIES.has(cat)) return null;

    // En avant d'abord : le joueur anticipe. L'arrière ne sert qu'à rattraper une réaction
    // partie juste après le début du sort de boss.
    const i = firstAhead(offsets, c.offsetBoss) ?? lastBehind(offsets, c.offsetBoss);
    return i === null ? null : anchors[i] ?? null;
  });
}

/** Vue réduite pour l'affichage : seul l'instant de l'ancre compte pour recaler une icône. */
export function alignedOffsets(
  casts: readonly AlignableCast[],
  ctx: AlignContext,
): Array<number | null> {
  return resolveAnchors(casts, ctx).map((a) => a?.offsetBoss ?? null);
}
