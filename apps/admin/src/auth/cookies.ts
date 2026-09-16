import type { NextAuthConfig } from 'next-auth';

// The chat-bot and admin app run on the same host, so Auth.js's default (unnamespaced)
// cookies would collide during concurrent OAuth sign-ins. We namespace every
// Auth.js cookie per app, not just the session token.
//
// Auth.js only auto-prepends `__Secure-`/`__Host-` to its own default cookie names,
// so overriding `name` requires us to add the prefixes ourselves. We always use the
// secure variants (in dev too): browsers treat http://localhost as a secure context,
// so `Secure`-flagged cookies still work there.
export const APP_COOKIE_PREFIX = 'ais-chat-admin.authjs';

export const SESSION_COOKIE_NAME = `${APP_COOKIE_PREFIX}.session-token`;
export const SECURE_SESSION_COOKIE_NAME = `__Secure-${SESSION_COOKIE_NAME}`;

export const AUTH_COOKIES: NextAuthConfig['cookies'] = {
  sessionToken: { name: SECURE_SESSION_COOKIE_NAME, options: { secure: true } },
  callbackUrl: { name: `__Secure-${APP_COOKIE_PREFIX}.callback-url`, options: { secure: true } },
  csrfToken: { name: `__Host-${APP_COOKIE_PREFIX}.csrf-token`, options: { secure: true } },
  pkceCodeVerifier: {
    name: `__Secure-${APP_COOKIE_PREFIX}.pkce.code_verifier`,
    options: { secure: true },
  },
  state: { name: `__Secure-${APP_COOKIE_PREFIX}.state`, options: { secure: true } },
  nonce: { name: `__Secure-${APP_COOKIE_PREFIX}.nonce`, options: { secure: true } },
  webauthnChallenge: {
    name: `__Secure-${APP_COOKIE_PREFIX}.challenge`,
    options: { secure: true },
  },
};
