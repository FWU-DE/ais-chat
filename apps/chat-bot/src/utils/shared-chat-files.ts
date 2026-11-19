// Exports stay allowed after a shared chat has ended, as long as it is not deleted or suspended.
export function addExportFlag(imageUrl: string): string {
  const separator = imageUrl.includes('?') ? '&' : '?';
  return `${imageUrl}${separator}export=true`;
}

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
