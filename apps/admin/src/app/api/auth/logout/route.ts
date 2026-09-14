import { auth } from '@/auth';
import { env } from '@/consts/env';
import { logError, logInfo, logWarning } from '@shared/logging';
import { withTrustedOrigin } from '@shared/utils/with-trusted-origin';
import { NextRequest, NextResponse } from 'next/server';

function handleEmptyToken(request: NextRequest) {
  logWarning('No valid token found, redirecting to logout-callback url');
  return NextResponse.redirect(new URL('/api/auth/logout-callback', request.url));
}

function redirectToIDP(request: NextRequest, idToken: string) {
  logInfo('Redirect to IDP with token for logout');
  const logoutUrl = new URL(`${env.keycloakIssuer}/protocol/openid-connect/logout`);
  logoutUrl.searchParams.append('id_token_hint', idToken);
  logoutUrl.searchParams.append(
    'post_logout_redirect_uri',
    new URL('/api/auth/logout-callback', request.url).toString(),
  );
  return NextResponse.redirect(logoutUrl);
}

/**
 * Route to handle logout.
 * If a valid JWT token is available, we redirect to the IDP to logout current session.
 * If no token is available, we simply redirect to the logout_callback url for cleanup.
 */
export async function GET(request: NextRequest) {
  const trustedRequest = withTrustedOrigin(request);

  try {
    const session = await auth();
    if (session?.idToken) return redirectToIDP(trustedRequest, session?.idToken);
    return handleEmptyToken(trustedRequest);
  } catch (error) {
    logError('Error during logout', error);
    return NextResponse.redirect(new URL('/', trustedRequest.url));
  }
}
