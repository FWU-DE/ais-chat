'use server';
import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';
import { getTemplates, createTemplateFromUrl } from '@ais-chat/shared/templates/template-service';

export async function getTemplatesAction() {
  await requireAdminOrEditorAuth();

  return getTemplates();
}

export async function createTemplateFromUrlAction(url: string) {
  await requireAdminOrEditorAuth();

  return createTemplateFromUrl(url);
}
