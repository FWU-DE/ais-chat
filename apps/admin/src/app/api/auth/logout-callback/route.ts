import { logError } from '@shared/logging';
import { withTrustedOrigin } from '@shared/utils/with-trusted-origin';
import { NextRequest, NextResponse } from 'next/server';
import { APP_COOKIE_PREFIX } from '@/auth/cookies';

/**
 * This route is called by the IDP after logout.
 * We clear all Auth.js cookies namespaced for this app and redirect to the application root.
 * If the session cookie is bigger than 4 kb, the cookie might be split into multiple cookies.
 * Therefore, we clear all cookies whose name contains the app's Auth.js cookie prefix.
 */
export async function GET(request: NextRequest) {
  const trustedRequest = withTrustedOrigin(request);

  try {
    const response = NextResponse.redirect(new URL('/', trustedRequest.url));
    const cookieNames = request.cookies
      .getAll()
      .map((cookie) => cookie.name)
      .filter((name) => name.includes(APP_COOKIE_PREFIX));

    cookieNames.forEach((cookieName) => {
      response.cookies.set(cookieName, '', {
        path: '/',
        maxAge: 0,
        secure: cookieName.startsWith('__Secure-') || cookieName.startsWith('__Host-'),
      });
    });

    return response;
  } catch (error) {
    logError('Error during logout-callback', error);
    return NextResponse.redirect(new URL('/', trustedRequest.url));
  }
}
