import { cleanupResources } from '@shared/cleanup/cleanup-service';
import { logError } from '@shared/logging';
import { NextRequest, NextResponse } from 'next/server';

import { validateApiKeyByHeadersWithResult } from '@/utils/validation';

export async function DELETE(req: NextRequest) {
  const [error] = validateApiKeyByHeadersWithResult(req.headers);

  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  try {
    const message = await cleanupResources();
    return NextResponse.json(message, { status: message.failedSteps.length === 0 ? 200 : 500 });
  } catch (error) {
    logError('Error during cleanup', error);
    return NextResponse.json({ error: 'Error during cleanup' }, { status: 500 });
  }
}
