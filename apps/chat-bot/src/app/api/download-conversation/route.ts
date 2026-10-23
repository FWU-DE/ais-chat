import { getUser } from '@/auth/utils';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import {
  getConversationAndMessagesForExport,
  getConversationMessageForExport,
} from '@shared/conversation/conversation-service';
import { dbGetModelByName } from '@shared/db/functions/llm-model';
import { type ConversationModel } from '@shared/db/types';
import { NextRequest, NextResponse } from 'next/server';
import z from 'zod';
import { serializeMessages } from './serialize-messages';

export const dynamic = 'force-dynamic';

const DEFAULT_GPT_NAME = 'AIS.chat';

const downloadConversationParamsSchema = z.object({
  conversationId: z.string(),
  messageId: z.string().optional(),
  enterpriseGptName: z.string().optional(),
});

/**
 * Returns Markdown content and authorized image URLs for a conversation or single message export.
 * The user must be the owner of the conversation.
 *
 * enterpriseGptName contains the character name if a character was used.
 */
export async function GET(req: NextRequest) {
  try {
    // check and parse search params
    const searchParams = req.nextUrl.searchParams;
    const { conversationId, messageId, enterpriseGptName } = downloadConversationParamsSchema.parse(
      Object.fromEntries(searchParams.entries()),
    );

    // check authentication
    const user = await getUser();
    const gptName = enterpriseGptName || DEFAULT_GPT_NAME;

    if (messageId === undefined) {
      const { conversation, messages, fileMapping } = await getConversationAndMessagesForExport({
        conversationId,
        userId: user.id,
      });
      const modelName = messages.findLast((message) => message.role === 'assistant')?.modelName;
      const model = modelName === undefined ? undefined : await dbGetModelByName(modelName);

      return NextResponse.json({
        fileName: generateFileName({ conversation, gptName }),
        conversationTitle: conversation.name,
        createdAt: conversation.createdAt.toISOString(),
        modelName: model?.displayName ?? modelName ?? gptName,
        messages: await serializeMessages({ messages, fileMapping }),
      });
    }

    const { conversation, message, fileMapping } = await getConversationMessageForExport({
      conversationId,
      messageId,
      userId: user.id,
    });
    const model =
      message.modelName === undefined ? undefined : await dbGetModelByName(message.modelName);

    return NextResponse.json({
      fileName: generateMessageFileName({
        conversationName: conversation.name,
        gptName,
        createdAt: message.createdAt,
      }),
      createdAt: message.createdAt.toISOString(),
      modelName: model?.displayName ?? message.modelName ?? gptName,
      messages: await serializeMessages({ messages: [message], fileMapping }),
    });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}

function generateFileName({
  conversation,
  gptName,
}: {
  conversation: ConversationModel;
  gptName: string;
}): string {
  const formattedDate = conversation.createdAt.toISOString().split('T')[0];
  const fileName = `${formattedDate} ${gptName} Gespräch über ${conversation.name}.docx`;

  return fileName;
}

function generateMessageFileName({
  conversationName,
  gptName,
  createdAt,
}: {
  conversationName: string | null;
  gptName: string;
  createdAt: Date;
}): string {
  const formattedDate = createdAt.toISOString().split('T')[0];
  const safeConversationName =
    conversationName === null || conversationName.trim() === '' ? 'Konversation' : conversationName;

  return `${formattedDate} ${gptName} Antwort aus ${safeConversationName}.docx`;
}
