import { useTranslation } from 'react-i18next';
import { CrudPage } from '../CrudPage.js';
import { PivotPanel } from '../PivotPanel.js';

export function SpellsPage() {
  const { t } = useTranslation();
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
          legend={t('admin.pivots.spellSpecs')}
          empty={t('admin.pivots.spellSpecsEmpty')}
        />
      )}
    />
  );
}
