import { createHash } from 'node:crypto';

/**
 * Encodage du format d'échange `ecp;2` — voir PLAN_FORMAT_V2.md.
 *
 * Cette couche ne connaît rien du domaine : elle sérialise un objet plan déjà constitué.
 * Aucun décodeur ici, on produit des plans à coller dans l'addon, on n'en lit pas.
 *
 * Principe du format : on n'émet que de la donnée de jeu observable — zoneID, spellID nus,
 * noms de joueurs, listes de talents. Aucune clé interne à l'addon. C'est lui qui résout
 * les variantes de cooldown, les instances et les occurrences.
 */

/**
 * Jeu sûr du §6. ⚠️ Ce n'est PAS `encodeURIComponent`, qui laisse passer `~ ! ' ( ) *`.
 * `=` et `~` sont volontairement HORS du jeu sûr bien qu'inutilisés par `ecp;2` : ça
 * réserve leur usage à de futurs enregistrements sans imposer un changement de version.
 */
const SAFE = /[A-Za-z0-9_.:#@-]/;

export const ECP_FORMAT = 2;

/** Percent-encodage octet par octet, en UTF-8, hexadécimal MAJUSCULE. */
export function enc(value: string | number): string {
  let out = '';
  for (const b of new TextEncoder().encode(String(value))) {
    const ch = String.fromCharCode(b);
    out += SAFE.test(ch) ? ch : `%${b.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return out;
}

export interface RosterEntry {
  /**
   * Jeton opaque et STABLE — clé de jointure entre `r;`, `h;` et `u;`, rien d'autre.
   * L'addon n'y cherche aucun sens.
   */
  id: string;
  /** `TANK` | `HEALER` | `DAMAGER`. Le joueur visé par `h;` doit être `HEALER`. */
  role: string;
  /** Jeton majuscule sans espace : `DEATHKNIGHT`, `DEMONHUNTER`… */
  class: string;
  /**
   * specID Blizzard — la SOURCE DE VÉRITÉ de l'identité.
   *
   * Ni le rôle ni le nom de spé ne suffisent : `Holy` est Paladin ET Prêtre, `Restoration`
   * Druide ET Chaman, `Frost` Mage ET Death Knight. Or l'addon doit connaître la classe
   * pour vérifier qu'un défensif appartient bien à son lanceur. Omissible (`;;`), l'addon
   * retombe alors sur classe + spé.
   */
  specID?: number;
  /** Nom anglais de la spécialisation : `Mistweaver`, `Holy`, `Unholy`… */
  spec: string;
  /**
   * spellID de talents. Doit être COMPLÈTE : certains défensifs sont définis par
   * l'ABSENCE d'un talent (§11.1), donc une liste partielle ne dégrade pas la
   * résolution, elle la fausse.
   *
   * ⚠️ Multiensemble, pas ensemble : un talent acheté à N points apparaît N fois (§11.8),
   * c'est ainsi que le nombre de points — donc le cooldown — voyage. Ne jamais
   * dédupliquer cette liste, ici ou en amont.
   */
  talents: readonly number[];
  /**
   * itemID des trinkets équipés — 8ᵉ champ, optionnel (§11.9).
   *
   * Certains défensifs plaçables ne viennent ni d'un talent ni d'une spé mais d'un objet ;
   * sans cette déclaration, l'addon refuse une ligne `u;` qui les vise. Vide ⇒ champ OMIS,
   * pas émis à blanc : un `;` final changerait la chaîne sans rien dire de plus, et un
   * addon antérieur au champ lit les sept premiers et ignore le reste.
   */
  items?: readonly number[];
}

export interface PlanUse {
  encID: number;
  /** spellID de la capacité de boss visée. */
  bossSpell: number;
  /** Rang de l'occurrence dans le combat, à partir de 1. */
  n: number;
  /** Référence un `r;`. */
  id: string;
  /** spellID du défensif, SANS suffixe : `740`, jamais `740:1`. */
  defSpell: number;
  /** Millisecondes signées. 0 ⇒ champ omis. */
  offsetMs?: number;
}

export interface EcpPlan {
  kind: 'variant' | 'boss';
  /** `instanceID` Blizzard. Requis pour `variant`. */
  zoneID?: number;
  /** Boss ciblé. Requis pour `boss` ; toutes les lignes `u;` doivent le porter. */
  encID?: number;
  /** Titre proposé — l'addon demande le nom à l'utilisateur et préremplit avec ça. */
  title?: string;
  roster: readonly RosterEntry[];
  /** `id` du soigneur. Doit référencer une ligne du roster, de rôle `HEALER`. */
  healer: string;
  uses: readonly PlanUse[];
}

export class EcpPlanError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EcpPlanError';
  }
}

/**
 * Sérialise un plan.
 *
 * ⚠️ Le roster est émis DANS L'ORDRE REÇU, jamais retrié. C'est lui qui détermine la
 * numérotation `#1`/`#2` des porteurs multiples côté addon (§11.2), et c'est le seul
 * endroit du format où une erreur ne produit ni rejet ni message : le plan reste valide,
 * il est simplement faux. L'appelant doit donc fixer un ordre déterministe et le tenir.
 *
 * Les lignes `u;` sont en revanche triées ici — `encID`, `bossSpell`, `n`, joueur — pour
 * que deux exports du même plan soient comparables octet pour octet.
 */
export function encodePlan(plan: EcpPlan): string {
  const byId = new Map(plan.roster.map((r) => [r.id, r]));
  const healer = byId.get(plan.healer);
  if (!healer) throw new EcpPlanError(`h; references “${plan.healer}”, who is not in the roster`);
  // Le §9 refuse l'import si le joueur désigné n'est pas soigneur : autant échouer ici.
  if (healer.role !== 'HEALER') {
    throw new EcpPlanError(`h; designates “${plan.healer}”, whose role is ${healer.role}, not HEALER`);
  }
  for (const u of plan.uses) {
    if (!byId.has(u.id)) throw new EcpPlanError(`u; references “${u.id}”, who is not in the roster`);
  }

  const lines: string[] = [`ecp;${ECP_FORMAT};${plan.kind}`];
  if (plan.kind === 'variant') {
    if (plan.zoneID === undefined) throw new EcpPlanError('kind=variant without zoneID');
    lines.push(`z;${plan.zoneID}`);
  } else {
    if (plan.encID === undefined) throw new EcpPlanError('kind=boss without encID');
    const stray = plan.uses.find((u) => u.encID !== plan.encID);
    if (stray) throw new EcpPlanError(`kind=boss: a u; line carries encID ${stray.encID}`);
    lines.push(`b;${plan.encID}`);
  }
  if (plan.title) lines.push(`n;${enc(plan.title)}`);

  for (const r of plan.roster) {
    // specID omis ⇒ champ vide (`;;`), pas absent : la position des suivants doit tenir.
    const row = ['r', enc(r.id), enc(r.role), enc(r.class), r.specID ?? '', enc(r.spec), r.talents.join(',')];
    // Champ terminal et optionnel : omis quand vide, jamais émis en `;` esseulé.
    if (r.items?.length) row.push(r.items.join(','));
    lines.push(row.join(';'));
  }
  lines.push(`h;${enc(plan.healer)}`);

  const uses = [...plan.uses].sort(
    (a, b) =>
      a.encID - b.encID || a.bossSpell - b.bossSpell || a.n - b.n || a.id.localeCompare(b.id),
  );
  for (const u of uses) {
    // Les entiers appartiennent au jeu sûr : jamais échappés.
    const row: (string | number)[] = ['u', u.encID, u.bossSpell, u.n, enc(u.id), u.defSpell];
    if (u.offsetMs) row.push(u.offsetMs); // omis quand nul
    lines.push(row.join(';'));
  }

  // `k;` est le seul garde-fou contre un collage tronqué, mode de défaillance nº 1.
  lines.push(`k;${uses.length}`);
  return lines.join('\n');
}

/**
 * Enveloppe de transport du §5bis — la forme à émettre par défaut.
 *
 * Le document `ecp;2` est multi-ligne, donc exposé à trois accidents de copier-coller :
 * un `\n` avalé, une sélection à la souris qui rate la DERNIÈRE ligne — or c'est `k;`,
 * le contrôle d'intégrité —, ou un utilisateur qui « corrige » la chaîne parce qu'elle
 * ressemble à du texte. L'enveloppe en fait un bloc opaque, monoligne, tout-ou-rien.
 *
 * Alphabet standard (`+` et `/`), padding conservé, aucun retour à la ligne inséré :
 * rien ne transite par une URL, la variante URL-safe serait une complication gratuite.
 */
export function toWire(document: string): string {
  /**
   * Le document est purement ASCII 7 bits — le percent-encodage des feuilles (§6) le
   * garantit, puisque le jeu sûr est ASCII et que tout le reste part en `%XX`.
   *
   * On le VÉRIFIE plutôt que de le supposer : un octet hors plage signalerait un
   * échappement oublié en amont, et le corriger ici en passant par UTF-8 masquerait le
   * vrai bug au lieu de le révéler.
   */
  const stray = document.match(/[^\x00-\x7F]/);
  if (stray) {
    throw new EcpPlanError(
      `Non-ASCII document (“${stray[0]}” at offset ${stray.index}): a leaf was not escaped. ` +
        'Fix enc(), not the transport.',
    );
  }
  // `latin1` reproduit exactement la sémantique de btoa : un caractère = un octet.
  const b64 = Buffer.from(document, 'latin1').toString('base64');

  /**
   * Auto-vérification avant livraison. Elle ne protège pas du transport — une chaîne
   * mangée en chemin le sera quoi qu'on fasse — mais elle garantit que ce qui SORT d'ici
   * est décodable. Un base64 dont la longueur n'est pas un multiple de 4 est malformé par
   * construction, et c'est le premier symptôme qu'on regarde quand un import échoue.
   */
  if (b64.length % 4 !== 0) throw new EcpPlanError(`Malformed base64: length ${b64.length}, not a multiple of 4`);
  if (Buffer.from(b64, 'base64').toString('latin1') !== document) {
    throw new EcpPlanError('base64 round-trip broken before emission');
  }
  return `ecp64:${b64}`;
}

/**
 * Empreinte courte du document, à comparer de part et d'autre du transport.
 *
 * Le `k;` du format détecte une TRONCATURE, pas une suppression au milieu de la chaîne —
 * or c'est ce dernier cas que produit un copier-coller à travers un rendu HTML. Un hash
 * annoncé avec la chaîne rend la corruption diagnosticable en une seconde.
 */
export function fingerprint(wire: string): string {
  return createHash('sha256').update(wire).digest('hex').slice(0, 16);
}
