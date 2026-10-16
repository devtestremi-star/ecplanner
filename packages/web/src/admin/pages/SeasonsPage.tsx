import { CrudPage } from '../CrudPage.js';
import { PivotPanel } from '../PivotPanel.js';

export function SeasonsPage() {
  return (
    <CrudPage
      resource="seasons"
      filters={['active', 'expansionId']}
      extra={(row) => (
        <PivotPanel
          resource="dungeon-seasons"
          parentField="season"
          parentId={row.__id}
          legend="Donjons de la saison"
          empty="Aucun donjon rattaché — le scan ne résoudra aucun encounterID."
        />
      )}
    />
  );
}
