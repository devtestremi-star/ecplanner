import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CrudPage } from '../CrudPage.js';
import type { Row } from '../types.js';

/** Page publique de la run : la timeline, telle que les visiteurs la voient. */
const runPath = (row: Row): string =>
  `/runs/${encodeURIComponent(String(row.reportCode))}/${String(row.fightID)}`;

export function RunsPage() {
  const { t } = useTranslation();
  return (
    <CrudPage
      resource="runs"
      filters={['season', 'dungeon', 'keystoneLevel', 'kill']}
      rowActions={(row) => (
        <Link className="btn sm ghost" to={runPath(row)} target="_blank" rel="noopener noreferrer">
          {t('admin.viewRun')}
        </Link>
      )}
      extra={(row) => (
        <p style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Link to={runPath(row)} target="_blank" rel="noopener noreferrer">{t('admin.viewRunLong')}</Link>
          <Link to={`/admin/scanned-bosses?run=${encodeURIComponent(row.__id)}`}>
            {t('admin.runScannedBosses')}
          </Link>
        </p>
      )}
    />
  );
}
