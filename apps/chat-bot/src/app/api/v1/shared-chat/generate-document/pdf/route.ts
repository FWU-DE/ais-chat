import { requiredNonEmptyString } from '@shared/utils/zod';
import { NextResponse } from 'next/server';

import { createPdfResponse } from '@/app/api/generate-document/pdf/pdf-response';
import {
  generatePdfFromMarkdown,
  pdfRequestSchema,
} from '@/app/api/generate-document/pdf/pdf-service';
import { getSharedChatDocument } from '@/app/api/shared-chat/shared-chat-document-service';
import { sharedChatCommonRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { handleErrorInRoute } from '@/error/handle-error-in-route';

const sharedChatPdfRequestSchema = sharedChatCommonRequestSchema
  .extend({ toolCallId: requiredNonEmptyString('toolCallId is required') })
  .extend(pdfRequestSchema.pick({ images: true, plots: true }).shape);

export async function POST(request: Request) {
  try {
    const parsed = sharedChatPdfRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    const { inviteCode, entityType, entityId, sharedSessionId, toolCallId, images, plots } =
      parsed.data;
    const document = await getSharedChatDocument({
      inviteCode,
      entityType,
      entityId,
      sharedSessionId,
      toolCallId,
    });

    return createPdfResponse(await generatePdfFromMarkdown({ ...document, images, plots }));
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
