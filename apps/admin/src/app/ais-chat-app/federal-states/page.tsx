import TwoColumnLayout from '@/components/layout/TwoColumnLayout';

import { AdminAppSidebar } from '../AdminAppSidebar';
import FederalStateListView from './FederalStateListView';

export const dynamic = 'force-dynamic';

export default function FederalStatesPage() {
  return <TwoColumnLayout sidebar={<AdminAppSidebar />} page={<FederalStateListView />} />;
}
