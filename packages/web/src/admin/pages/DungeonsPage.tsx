import { useTranslation } from 'react-i18next';
import { CrudPage } from '../CrudPage.js';
import { PivotPanel } from '../PivotPanel.js';

export function DungeonsPage() {
  const { t } = useTranslation();
  return (
    <CrudPage
      resource="dungeons"
      extra={(row) => (
        <PivotPanel
          resource="dungeon-seasons"
          parentField="dungeon"
          parentId={row.__id}
          legend={t('admin.pivots.dungeonSeasons')}
          empty={t('admin.pivots.dungeonSeasonsEmpty')}
        />
      )}
    />
  );
}
