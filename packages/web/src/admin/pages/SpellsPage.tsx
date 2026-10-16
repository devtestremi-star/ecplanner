import { CrudPage } from '../CrudPage.js';
import { PivotPanel } from '../PivotPanel.js';

export function SpellsPage() {
  return (
    <CrudPage
      resource="spells"
      columns={['spellId', 'name', 'category', 'cooldownSec', 'cooldownSamples', 'boss', 'filterType']}
      filters={['category', 'filterType', 'boss']}
      extra={(row) => (
        <PivotPanel
          resource="spell-specs"
          parentField="spell"
          parentId={row.__id}
          legend="Specs concernées"
          empty="Aucune spec : sort inter-classes, toujours inclus au scan."
        />
      )}
    />
  );
}
