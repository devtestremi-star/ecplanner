import i18n from '../i18n/index.js';

export interface SpellSummary {
  spellId: number;
  name: string;
  icon: string | null;
  category: string | null;
  baseCooldownSec: number | null;
  /** Sort de boss planifiable dans l'addon : ancre d'alignement et cible d'export ECP. */
  allowedInPlan: boolean;
  /** Requalifications par spec du lanceur, `{ specId: category }`. */
  bySpec?: Record<number, string>;
}

/**
 * Le catalogue est chargé une fois pour toute la session : 206 sorts, 5 Ko gzip.
 * L'expiration est laissée au protocole (`Cache-Control: max-age=86400`) — le navigateur
 * gère révalidation et purge mieux qu'un TTL maison en localStorage.
 */
let catalogPromise: Promise<Map<number, SpellSummary>> | null = null;

export function loadCatalog(): Promise<Map<number, SpellSummary>> {
  // `cache: 'no-cache'` force une requête conditionnelle même si une réponse plus
  // ancienne est encore « fraîche » selon son max-age. Sans ça, un catalogue mis en
  // cache avant l'arrivée de l'ETag resterait servi tel quel pendant 24 h, et la
  // timeline signalerait des sorts « absents » qui existent bel et bien.
  catalogPromise ??= fetch('/api/spells/catalog', { cache: 'no-cache' })
    .then((r) => {
      if (!r.ok) throw new Error(i18n.t('errors.catalogHttp', { status: r.status }));
      return r.json() as Promise<{ spells: SpellSummary[] }>;
    })
    .then(({ spells }) => new Map(spells.map((s) => [s.spellId, s])))
    .catch((err) => {
      catalogPromise = null; // un échec ne doit pas figer la session
      throw err;
    });
  return catalogPromise;
}

/**
 * ⚠️ Le CDN Blizzard n'accepte QUE ces trois tailles. 32, 40, 64 rendent un 403 —
 * pas un 404, et le navigateur reçoit du XML là où il attend une image.
 */
export const ICON_SIZES = [18, 36, 56] as const;
export type IconSize = (typeof ICON_SIZES)[number];

/** Plus petite taille servie qui couvre l'affichage demandé, pour ne pas flouter. */
export const iconSizeFor = (displayPx: number): IconSize =>
  ICON_SIZES.find((s) => s >= displayPx) ?? 56;

/** Icônes servies par le CDN first-party de Blizzard. `.jpg` obligatoire, 403 sinon. */
/**
 * Repli : le CDN de Wowhead. Celui de Blizzard ne sert pas toutes les icônes récentes —
 * 10 du catalogue y rendent un 403 (bijoux et sorts de boss de la saison en cours, dont le
 * Soulcoiler Ritual Vessel), alors que Wowhead les a toutes. Mêmes noms de fichier ; ses
 * trois tailles portent un nom au lieu d'un nombre.
 */
const ZAMIMG_SIZE: Record<IconSize, string> = { 18: 'small', 36: 'medium', 56: 'large' };
export const iconFallbackUrl = (icon: string | null, size: IconSize = 36): string | null =>
  icon ? `https://wow.zamimg.com/images/wow/icons/${ZAMIMG_SIZE[size]}/${icon}` : null;

export const iconUrl = (icon: string | null, size: IconSize = 36): string | null =>
  icon ? `https://render.worldofwarcraft.com/us/icons/${size}/${icon}` : null;

/**
 * Tooltips chargés au survol et mémorisés. L'utilisateur n'en survole qu'une poignée —
 * les embarquer tous coûterait 161 Ko pour rien.
 */
const tooltips = new Map<number, Promise<string | null>>();

export function loadTooltip(spellId: number): Promise<string | null> {
  let p = tooltips.get(spellId);
  if (!p) {
    p = fetch(`/api/spells/${spellId}/tooltip`)
      .then((r) => (r.ok ? (r.json() as Promise<{ tooltipHtml: string | null }>) : null))
      .then((j) => j?.tooltipHtml ?? null)
      .catch(() => {
        tooltips.delete(spellId); // réessayable au prochain survol
        return null;
      });
    tooltips.set(spellId, p);
  }
  return p;
}
