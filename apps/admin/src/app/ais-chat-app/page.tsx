import TwoColumnLayout from '@/components/layout/TwoColumnLayout';

import { AdminAppSidebar } from './AdminAppSidebar';

export default function Page() {
  return <TwoColumnLayout sidebar={<AdminAppSidebar />} page={<div></div>} />;
}
