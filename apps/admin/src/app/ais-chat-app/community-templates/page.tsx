import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';
import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import { AdminAppSidebar } from '../AdminAppSidebar';
import CommunityTemplateRequestsListView from './CommunityTemplateRequestsListView';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAdminOrEditorAuth();
  return (
    <TwoColumnLayout sidebar={<AdminAppSidebar />} page={<CommunityTemplateRequestsListView />} />
  );
}
