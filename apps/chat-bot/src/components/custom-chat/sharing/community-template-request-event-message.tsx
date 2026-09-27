'use client';

import { type CommunityTemplateRequestEventSelectModel } from '@shared/db/schema';

export type CommunityTemplateRequestEventMessageProps = {
  message: string;
  createdByRole: CommunityTemplateRequestEventSelectModel['createdByRole'];
};

export function CommunityTemplateRequestEventMessage({
  message,
  createdByRole,
}: CommunityTemplateRequestEventMessageProps) {
  const backgroundColor = createdByRole === 'user' ? 'bg-primary/10' : 'bg-secondary/30';

  return <div className={`${backgroundColor} px-4 py-3 rounded-xl rounded-br-none`}>{message}</div>;
}
