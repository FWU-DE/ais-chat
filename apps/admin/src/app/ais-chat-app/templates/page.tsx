import TwoColumnLayout from '@/components/layout/TwoColumnLayout';
import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';
import { AdminAppSidebar } from '../AdminAppSidebar';
import TemplateListView from './TemplateListView';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await requireAdminOrEditorAuth();
  return <TwoColumnLayout sidebar={<AdminAppSidebar />} page={<TemplateListView />} />;
}
