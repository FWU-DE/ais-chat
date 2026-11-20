export function getSharedChatImageUrl({
  fileId,
  inviteCode,
  entityType,
  entityId,
  sharedSessionId,
  forExport = false,
}: {
  fileId: string;
  inviteCode: string;
  entityType: 'character' | 'learningScenario';
  entityId: string;
  sharedSessionId: string;
  forExport?: boolean;
}): string {
  const params = new URLSearchParams({
    inviteCode,
    entityType,
    entityId,
    sharedSessionId,
    width: '200',
    height: '200',
  });
  if (forExport) {
    params.set('export', 'true');
  }

  return `/api/v1/shared-chat/files/${fileId}/scaled-image?${params.toString()}`;
}
