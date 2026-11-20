import { logError } from '@shared/logging';
import { refreshEntityPopularity } from '@shared/popularity/popularity-service';
import { NextRequest, NextResponse } from 'next/server';

import { validateApiKeyByHeadersWithResult } from '@/utils/validation';

export async function POST(req: NextRequest) {
  const [error] = validateApiKeyByHeadersWithResult(req.headers);

  if (error !== null) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }

  try {
    const result = await refreshEntityPopularity();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    logError('Error during popularity refresh', error);
    return NextResponse.json({ error: 'Error during popularity refresh' }, { status: 500 });
  }
}
