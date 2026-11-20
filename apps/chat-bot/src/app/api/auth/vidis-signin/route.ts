import type { NextRequest } from 'next/server';

import { signIn } from '@/auth';
import { getSafeCallbackUrl } from '@/auth/callback-url';

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const callbackUrl = getSafeCallbackUrl(searchParams.get('callbackUrl'));
  const vidis_idp_hint = searchParams.get('vidis_idp_hint') ?? '';

  await signIn('vidis', { redirectTo: callbackUrl }, { vidis_idp_hint });
}
