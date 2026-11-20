'use server';
import { createTemplateFromUrl, getTemplates } from '@ais-chat/shared/templates/template-service';

import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';

export async function getTemplatesAction() {
  await requireAdminOrEditorAuth();

  return getTemplates();
}

export async function createTemplateFromUrlAction(url: string) {
  await requireAdminOrEditorAuth();

  return createTemplateFromUrl(url);
}
