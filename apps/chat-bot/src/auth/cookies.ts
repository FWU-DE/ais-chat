import { isDevelopment } from '@shared/utils/isDevelopment';

export const SESSION_COOKIE_NAME = 'ais-chat-app.authjs.session-token';
export const SECURE_SESSION_COOKIE_NAME = `__Secure-${SESSION_COOKIE_NAME}`;

// Auth.js only auto-prepends `__Secure-` for its own default cookie name; since we
// override the name, we must select the secure variant ourselves for HTTPS deployments.
export const ACTIVE_SESSION_COOKIE_NAME = isDevelopment()
  ? SESSION_COOKIE_NAME
  : SECURE_SESSION_COOKIE_NAME;
