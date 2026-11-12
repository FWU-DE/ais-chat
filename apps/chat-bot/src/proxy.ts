import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * Proxy to add the current path to request headers.
 * This allows server components to access the URL for redirect handling.
 */
export function proxy(request: NextRequest) {
  const { pathname, searchParams } = request.nextUrl;

  // If vidis_idp_hint is set, redirect indirectly to vidis
  // Has to be done indirectly, because cookies will be set by auth signIn.
  if (pathname === '/login') {
    const vidisIdpHint = searchParams.get('vidis_idp_hint');
    if (vidisIdpHint) {
      // Only swap out the pathname, keep the search params for the idp hint and callback URL
      const url = request.nextUrl.clone();
      url.pathname = '/api/auth/vidis-signin';
      return NextResponse.redirect(url);
    }
  }

  const requestHeaders = new Headers(request.headers);

  if (!pathname.startsWith('/logout')) {
    // Set the current pathname for use in server components
    requestHeaders.set('x-pathname', pathname);
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
