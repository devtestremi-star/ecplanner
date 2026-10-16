import { useTranslation } from 'react-i18next';
import { CrudPage } from '../CrudPage.js';
import { PivotPanel } from '../PivotPanel.js';

export function SeasonsPage() {
  const { t } = useTranslation();
  return (
    <CrudPage
      resource="seasons"
      filters={['active', 'expansionId']}
      extra={(row) => (
        <PivotPanel
          resource="dungeon-seasons"
          parentField="season"
          parentId={row.__id}
          legend={t('admin.pivots.seasonDungeons')}
          empty={t('admin.pivots.seasonDungeonsEmpty')}
        />
      )}
    />
  );
}
