import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { generateSharedConversationDocxFiles } from './utils';
import { formatDateToDayMonthYear } from '@shared/utils/date';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { checkInviteCodeForExport } from '@shared/conversation/conversation-service';
import { dbGetFilesInIds } from '@shared/db/functions/files';
import { type FileModel } from '@shared/db/schema';
import { ForbiddenError } from '@shared/error';
import { isSharedChatFileMetadata, type SharedChatFileMetadata, verify } from '../../shared-chat';
import { getSharedChatEntity } from '../../shared-chat/shared-chat-get-entity';

const requestSchema = z.object({
  messages: z.array(
    z.object({
      id: z.string(),
      content: z.string(),
      role: z.enum(['user', 'assistant', 'system']),
      files: z
        .array(
          z.object({
            id: z.string(),
          }),
        )
        .optional(),
    }),
  ),
  characterName: z.string().optional(),
  sharedConversationName: z.string().optional(),
  inviteCode: z.string(),
  sharedSessionId: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const json = await request.json();
    const parseResult = requestSchema.parse(json);
    await checkInviteCodeForExport({ inviteCode: parseResult.inviteCode });

    const { messages, characterName, sharedConversationName, inviteCode, sharedSessionId } =
      parseResult;
    const fileMapping = await getSharedChatFileMapping({
      messages,
      inviteCode,
      sharedSessionId,
    });

    const conversationObject = await generateSharedConversationDocxFiles({
      conversationMessages: messages,
      userFullName: 'Nutzer/in',
      fileMapping,
    });

    if (conversationObject === undefined) {
      return NextResponse.json({ error: 'Failed to generate the document' }, { status: 500 });
    }

    const { buffer } = conversationObject;
    const fileName = generateFileName({ characterName, sharedConversationName });

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Disposition': 'attachment',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Length': buffer.byteLength.toString(),
        'X-Filename': encodeURIComponent(fileName),
      },
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

async function getSharedChatFileMapping({
  messages,
  inviteCode,
  sharedSessionId,
}: {
  messages: z.infer<typeof requestSchema>['messages'];
  inviteCode: string;
  sharedSessionId?: string;
}): Promise<Map<string, FileModel[]>> {
  const messageFileIds = messages.map((message) => ({
    messageId: message.id,
    fileIds: message.files?.map((file) => file.id) ?? [],
  }));
  const fileIds = [...new Set(messageFileIds.flatMap((message) => message.fileIds))];

  if (fileIds.length === 0) {
    return new Map();
  }

  if (sharedSessionId === undefined || sharedSessionId.trim() === '') {
    throw new ForbiddenError('Not authorized to use uploaded files');
  }

  const files = await dbGetFilesInIds(fileIds);
  verify.filesDoNotBelongToAnyUser(files);
  const fileMetadata = verifySharedChatFilesBelongToSession({ files, inviteCode, sharedSessionId });
  const sharedEntity = await getSharedChatEntity({
    inviteCode,
    entityType: fileMetadata.entityType,
    entityId: fileMetadata.entityId,
  });

  verify.sharedChatEntityIsAccessible(sharedEntity);
  verify.sharedChatFileOwnershipBySession({
    files,
    inviteCode,
    entityType: fileMetadata.entityType,
    entityId: fileMetadata.entityId,
    sharedSessionId,
  });

  const filesById = new Map(files.map((file) => [file.id, file]));
  const fileMapping = new Map<string, FileModel[]>();

  for (const { messageId, fileIds } of messageFileIds) {
    const messageFiles = fileIds
      .map((fileId) => filesById.get(fileId))
      .filter((file): file is FileModel => file !== undefined);

    if (messageFiles.length > 0) {
      fileMapping.set(messageId, messageFiles);
    }
  }

  return fileMapping;
}

function verifySharedChatFilesBelongToSession({
  files,
  inviteCode,
  sharedSessionId,
}: {
  files: FileModel[];
  inviteCode: string;
  sharedSessionId: string;
}): SharedChatFileMetadata {
  let firstFileMetadata: SharedChatFileMetadata | undefined;

  for (const file of files) {
    if (
      !isSharedChatFileMetadata(file.metadata) ||
      file.metadata.inviteCode !== inviteCode ||
      file.metadata.sessionId !== sharedSessionId
    ) {
      throw new ForbiddenError('Not authorized to access this file');
    }

    firstFileMetadata ??= file.metadata;
  }

  if (firstFileMetadata === undefined) {
    throw new ForbiddenError('Not authorized to access this file');
  }

  return firstFileMetadata;
}

function generateFileName({
  characterName,
  sharedConversationName,
}: {
  characterName?: string;
  sharedConversationName?: string;
}) {
  const currentDate = formatDateToDayMonthYear(new Date());

  if (characterName !== undefined) {
    return `${currentDate}-Gespräch mit ${characterName}.docx`;
  }

  if (sharedConversationName !== undefined) {
    return `${currentDate}-Dialog über ${sharedConversationName}.docx`;
  }

  return 'AIS-chat-Konversation.docx';
}
