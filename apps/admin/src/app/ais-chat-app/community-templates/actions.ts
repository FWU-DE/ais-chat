'use server';

import { runServerAction } from '@shared/actions/run-server-action';
import { getCommunityTemplateRequests } from '@shared/community-templates/community-template-service.admin';

import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';

export async function getCommunityTemplateRequestsAction() {
  await requireAdminOrEditorAuth();
  return runServerAction('getCommunityTemplateRequests', getCommunityTemplateRequests)();
}
