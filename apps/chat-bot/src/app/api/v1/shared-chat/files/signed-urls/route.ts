import { NextRequest, NextResponse } from 'next/server';
import { handleErrorInRoute } from '@/error/handle-error-in-route';
import { getSharedChatReadOnlySignedUrls } from '@/app/api/shared-chat/shared-chat-read-service';
import { sharedChatSignedUrlsRequestSchema } from '@/app/api/shared-chat/shared-chat-request-schemas';
import { requireValidInviteCode } from '@/auth/requireValidInviteCode';

export async function POST(req: NextRequest) {
  try {
    let json: unknown;
    try {
      json = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

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
