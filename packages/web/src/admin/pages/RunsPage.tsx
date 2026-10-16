import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CrudPage } from '../CrudPage.js';

export function RunsPage() {
  const { t } = useTranslation();
  return (
    <CrudPage
      resource="runs"
      filters={['season', 'dungeon', 'keystoneLevel', 'kill']}
      extra={(row) => (
        <p style={{ marginTop: 22 }}>
          <Link to={`/admin/scanned-bosses?run=${encodeURIComponent(row.__id)}`}>
            {t('admin.runScannedBosses')}
          </Link>
        </p>
      )}
    />
  );
}
