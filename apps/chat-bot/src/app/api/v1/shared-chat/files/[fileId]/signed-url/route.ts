import { NextRequest, NextResponse } from 'next/server';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { getSharedChatReadOnlySignedUrl } from '@/app/api/shared-chat/shared-chat-read-service';
import { sharedChatSignedUrlRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const parseResult = sharedChatSignedUrlRequestSchema.parse({ ...searchParams, fileId });

    await requireValidInviteCode(parseResult.inviteCode);

    const url = await getSharedChatReadOnlySignedUrl(parseResult);

    return NextResponse.json({ url });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
