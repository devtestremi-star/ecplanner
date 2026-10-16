import { Link } from 'react-router-dom';
import { CrudPage } from '../CrudPage.js';

export function RunsPage() {
  return (
    <CrudPage
      resource="runs"
      filters={['season', 'dungeon', 'keystoneLevel', 'kill']}
      extra={(row) => (
        <p style={{ marginTop: 22 }}>
          <Link to={`/admin/scanned-bosses?run=${encodeURIComponent(row.__id)}`}>
            Voir les boss scannés de cette run →
          </Link>
        </p>
      )}
    />
  );
}
