export type ToolRelatedMessageLike = {
  role: string;
  toolCallId?: string | null;
  toolCalls?: unknown[] | null;
};

export function isToolRelatedMessage(message: ToolRelatedMessageLike): boolean {
  return (
    message.role === 'tool' ||
    (message.toolCallId !== null && message.toolCallId !== undefined) ||
    (Array.isArray(message.toolCalls) && message.toolCalls.length > 0)
  );
}
