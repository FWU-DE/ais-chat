import { deleteOutdatedConversations } from '@shared/cleanup/cleanup-service';
import { NextRequest, NextResponse } from 'next/server';

import { validateApiKeyByHeadersWithResult } from '@/utils/validation';

export async function DELETE(req: NextRequest) {
  const [error] = validateApiKeyByHeadersWithResult(req.headers);

  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  const response = await deleteOutdatedConversations({
    deleteUnusedS3Files: req.nextUrl.searchParams.get('deleteUnusedS3Files') === 'true',
  });

  return NextResponse.json(response, { status: 200 });
}
