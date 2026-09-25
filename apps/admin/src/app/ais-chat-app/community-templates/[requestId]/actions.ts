'use server';

import { requireAdminOrEditorAuth } from '@/auth/requireAdminAuth';
import { runServerAction } from '@shared/actions/run-server-action';
import {
  getCommunityTemplateRequestWithEventsForAdmin,
  updateInternalNote,
  approveRequest,
  rejectRequest,
  addMessageForUser,
} from '@shared/community-templates/community-template-service.admin';

export async function getCommunityTemplateRequestWithEventsForAdminAction(requestId: string) {
  return runServerAction(
    'getCommunityTemplateRequestWithEventsForAdmin',
    getCommunityTemplateRequestWithEventsForAdmin,
  )(requestId);
}

export async function updateInternalNoteAction(requestId: string, note: string) {
  await requireAdminOrEditorAuth();

  return runServerAction('updateInternalNote', updateInternalNote)(requestId, note);
}

export async function approveRequestAction(requestId: string) {
  const session = await requireAdminOrEditorAuth();
  const editorId = session.user.id;
  const editorName = session.user.name ?? session.user.email;

  return runServerAction('approveRequest', approveRequest)(requestId, editorId, editorName);
}

export async function rejectRequestAction(requestId: string, message: string) {
  const session = await requireAdminOrEditorAuth();
  const editorId = session.user.id;
  const editorName = session.user.name ?? session.user.email;

  return runServerAction('rejectRequest', rejectRequest)(requestId, editorId, editorName, message);
}

export async function addMessageForUserAction(
  requestId: string,
  editorId: string,
  editorName: string,
  message: string,
) {
  return runServerAction('addMessageForUser', addMessageForUser)(
    requestId,
    editorId,
    editorName,
    message,
  );
}
