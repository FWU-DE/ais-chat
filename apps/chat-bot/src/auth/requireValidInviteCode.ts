import {
  type ChatInfo,
  getChatInfoByInviteCode,
} from '@shared/sharing/get-chat-info-by-invite-code';

export async function requireValidInviteCode(inviteCode: string): Promise<{ chatInfo: ChatInfo }> {
  const chatInfo = await getChatInfoByInviteCode(inviteCode);
  return { chatInfo };
}
