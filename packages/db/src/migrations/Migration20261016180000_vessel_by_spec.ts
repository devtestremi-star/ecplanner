import { Migration } from '@mikro-orm/migrations';

/**
 * Soulcoiler Ritual Vessel (1291894) : HEALER quand une spec soigneuse le lance,
 * EXTERNAL (sa catégorie par défaut) sinon.
 *
 * La requalification passe par `spell_spec`, qui sert AUSSI au filtre de scan : un sort
 * sans lien est toujours scanné, un sort lié ne l'est que si l'une de ses specs est dans
 * la run. Le lier aux seules specs soigneuses ferait disparaître le Vessel d'un dps dans
 * un groupe sans soigneur — on le lie donc à TOUTES les specs, ce qui est vrai d'un
 * trinket, et il reste toujours scanné.
 *
 * Listes figées ici plutôt que lues dans `specs.json` : une migration appliquée ne doit
 * pas changer de sens quand le seed évolue. Miroir de `spells-manual.json` (specIds) et
 * de `spec-overrides.json` (requalifications).
 */
const VESSEL = 1291894;

const ALL_SPECS = [
  62, 63, 64, 65, 66, 70, 71, 72, 73, 102, 103, 104, 105, 250, 251, 252, 253, 254, 255, 256,
  257, 258, 259, 260, 261, 262, 263, 264, 265, 266, 267, 268, 269, 270, 577, 581, 1467, 1468, 1473, 1480,
];

/** Holy Pal, Resto Druide, Disc, Holy Priest, Resto Chaman, Mistweaver, Preservation. */
const HEALER_SPECS = [65, 105, 256, 257, 264, 270, 1468];

export class Migration20261016180000_vessel_by_spec extends Migration {
  override async up(): Promise<void> {
    const values = ALL_SPECS
      .map((spec) => `(${VESSEL}, ${spec}, ${HEALER_SPECS.includes(spec) ? "'HEALER'" : 'null'})`)
      .join(', ');
    // Ne crée les liens que si le sort existe : sur une base pas encore seedée, rien à faire.
    this.addSql(
      `insert into spell_spec (spell_id, spec_id, category)
       select v.spell_id, v.spec_id, v.category from (values ${values}) as v(spell_id, spec_id, category)
       where exists (select 1 from spell s where s.spell_id = v.spell_id)
       on conflict (spell_id, spec_id) do update set category = excluded.category;`,
    );
  }

  override async down(): Promise<void> {
    // Retour à l'état sans lien : sort inter-classes, EXTERNAL pour tous.
    this.addSql(`delete from spell_spec where spell_id = ${VESSEL};`);
  }
}
