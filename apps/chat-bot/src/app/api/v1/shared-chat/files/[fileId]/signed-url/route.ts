import { NextRequest, NextResponse } from 'next/server';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { getSharedChatReadOnlySignedUrl } from '@/app/api/shared-chat/shared-chat-read-service';
import { sharedChatSignedUrlRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';

export async function GET(req: NextRequest, { params }: { params: Promise<{ fileId: string }> }) {
  try {
    const { fileId } = await params;
    const searchParams = Object.fromEntries(req.nextUrl.searchParams);
    const parseResult = sharedChatSignedUrlRequestSchema.safeParse({ ...searchParams, fileId });

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    await requireValidInviteCode(parseResult.data.inviteCode);

    const url = await getSharedChatReadOnlySignedUrl(parseResult.data);

    return NextResponse.json({ url });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
