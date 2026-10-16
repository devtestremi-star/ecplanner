import { CrudPage } from '../CrudPage.js';

export function ScannedBossesPage() {
  // `events` porte les casts : édité dans le tiroir, jamais listé.
  return <CrudPage resource="scanned-bosses" filters={['run', 'boss']} />;
}
