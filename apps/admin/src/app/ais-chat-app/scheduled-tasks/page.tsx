import { requireAdminAuth } from '@/auth/requireAdminAuth';
import TwoColumnLayout from '@/components/layout/TwoColumnLayout';

import { AdminAppSidebar } from '../AdminAppSidebar';
import TasksView from './TasksView';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  await requireAdminAuth();
  return <TwoColumnLayout sidebar={<AdminAppSidebar />} page={<TasksView />} />;
}
