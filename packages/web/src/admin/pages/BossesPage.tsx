import { CrudPage } from '../CrudPage.js';

export function BossesPage() {
  return <CrudPage resource="bosses" filters={['dungeon']} />;
}
