export function getSharedChatImageUrl({
  fileId,
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
}: {
  fileId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: string;
}): string {
  const params = new URLSearchParams({
    inviteCode,
    entityType,
    entityId,
    sharedSessionId,
    width: '200',
    height: '200',
  });

  return `/api/v1/shared-chat/files/${fileId}/scaled-image?${params.toString()}`;
}
