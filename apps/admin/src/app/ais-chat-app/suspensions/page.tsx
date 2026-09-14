import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';
import { AdminAppSidebar } from '../AdminAppSidebar';
import SuspensionRequestEntitiesOverview from './SuspensionRequestEntitiesOverview';

export const dynamic = 'force-dynamic';

export default async function SuspensionsPage() {
  await requireAdminOrEditorAuth();
  return (
    <TwoColumnLayout sidebar={<AdminAppSidebar />} page={<SuspensionRequestEntitiesOverview />} />
  );
}
