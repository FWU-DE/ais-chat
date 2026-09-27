import { type CommunityTemplateRequestEventInsertModel } from '@shared/db/schema';

export function createSubmitEvent(
  templateRequestId: string,
  userId: string,
): CommunityTemplateRequestEventInsertModel {
  return {
    templateRequestId,
    createdById: userId,
    createdByName: '',
    createdByRole: 'user',
    eventType: 'submit',
    message: '',
  };
}

export function createCancelEvent(
  templateRequestId: string,
  userId: string,
): CommunityTemplateRequestEventInsertModel {
  return {
    templateRequestId,
    createdById: userId,
    createdByName: '',
    createdByRole: 'user',
    eventType: 'cancel',
    message: '',
  };
}
