import { CrudPage } from '../CrudPage.js';
import { PivotPanel } from '../PivotPanel.js';

export function DungeonsPage() {
  return (
    <CrudPage
      resource="dungeons"
      extra={(row) => (
        <PivotPanel
          resource="dungeon-seasons"
          parentField="dungeon"
          parentId={row.__id}
          legend="encounterID par saison"
          empty="Aucune saison — ce donjon ne sera reconnu dans aucun rapport."
        />
      )}
    />
  );
}
