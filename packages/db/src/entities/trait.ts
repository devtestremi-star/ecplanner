import { Entity, Index, PrimaryKey, PrimaryKeyProp } from '@mikro-orm/core';

/**
 * Correspondance nœud d'arbre de talents → sort, extraite de DB2.
 *
 * Pourquoi elle existe : `CombatantInfo.talentTree` de WCL rend `[{ id, rank, nodeID }]`
 * où `id` est un `TraitNodeEntry.ID`. Le champ `talents`, lui, est TOUJOURS vide côté WCL
 * — vérifié sur un dump complet. Il n'existe donc aucun moyen d'obtenir les spellID de
 * talents d'un joueur sans cette table.
 *
 * Ce n'est pas un `Spell` : une entrée de nœud ne décrit pas un sort, elle POINTE vers un.
 * Les 5589 sorts visés sont pour l'essentiel hors de notre curation.
 *
 * ⚠️ Indexée sur une version de client. L'arbre change à chaque patch et les
 * `nodeEntryId` avec — il faut régénérer `trait-entries.json` et relancer le seed, sinon
 * des talents deviennent irrésolubles en silence.
 */
@Entity({ tableName: 'trait_entry' })
export class TraitEntry {
  /** `TraitNodeEntry.ID`, ce que WCL nomme `talentTree[].id`. */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  nodeEntryId!: number;

  /**
   * Un même nœud peut viser plusieurs sorts — un talent accorde parfois un sort et en
   * affiche un autre (Avenging Crusader accorde 394088, affiche 216331). D'où la clé
   * composite plutôt qu'une colonne simple.
   */
  @PrimaryKey({ type: 'integer', autoincrement: false })
  @Index()
  spellId!: number;

  [PrimaryKeyProp]?: ['nodeEntryId', 'spellId'];
}
