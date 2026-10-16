import { CrudPage } from '../CrudPage.js';

export function ScanJobsPage() {
  return <CrudPage resource="scan-jobs" filters={['status']} />;
}
