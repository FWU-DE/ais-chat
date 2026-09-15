import { NextRequest, NextResponse } from 'next/server';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { getSharedChatReadOnlySignedUrls } from '@/app/api/shared-chat/shared-chat-read-service';
import { sharedChatSignedUrlsRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';

export async function POST(req: NextRequest) {
  try {
    const json = await req.json();
    const parseResult = sharedChatSignedUrlsRequestSchema.safeParse(json);

    if (!parseResult.success) {
      return NextResponse.json({ error: 'Invalid request parameters' }, { status: 400 });
    }

    await requireValidInviteCode(parseResult.data.inviteCode);

    const urls = await getSharedChatReadOnlySignedUrls(parseResult.data);

    return NextResponse.json({ urls });
  } catch (error) {
    return handleErrorInRoute(error);
  }
}
