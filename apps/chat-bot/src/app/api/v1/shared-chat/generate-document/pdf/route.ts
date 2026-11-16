import { NextResponse } from 'next/server';

import { createPdfResponse } from '@/app/api/generate-document/pdf/pdf-response';
import {
  generatePdfFromMarkdown,
  pdfRequestSchema,
} from '@/app/api/generate-document/pdf/pdf-service';
import { verifySharedChatDocumentAccess } from '@/app/api/shared-chat/shared-chat-document-service';
import { sharedChatCommonRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { handleErrorInRoute } from '@/error/handle-error-in-route';

const sharedChatPdfRequestSchema = sharedChatCommonRequestSchema.extend(pdfRequestSchema.shape);

export async function POST(request: Request) {
  try {
    const parsed = sharedChatPdfRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    const { inviteCode, entityType, entityId, sharedSessionId, ...pdfRequest } = parsed.data;
    await verifySharedChatDocumentAccess({
      inviteCode,
      entityType,
      entityId,
      sharedSessionId,
      markdown: pdfRequest.markdown,
    });

    return createPdfResponse(await generatePdfFromMarkdown(pdfRequest));
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
