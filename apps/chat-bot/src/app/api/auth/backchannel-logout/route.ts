import { getVidisJwks } from '@/auth/providers/vidis-provider';
import { sessionBlockList } from '@/auth/session';
import { env } from '@/env';
import { logError, logInfo, logWarning } from '@shared/logging';
import { jwtVerify } from 'jose';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
const logoutTokenSchema = z.object({
  sid: z.string().min(1),
  iat: z.number(),
  exp: z.number(),
  jti: z.string().min(1),
  events: z.object({
    [BACKCHANNEL_LOGOUT_EVENT]: z.object({}),
  }),
  nonce: z.never().optional(),
});

/**
 * Extract the logout_token from the request body
 * @param req
 * @returns logout_token as string or null if not found
 */
async function getLogoutTokenFromRequest(req: NextRequest) {
  const bodyText = await req.text();
  const params = new URLSearchParams(bodyText);
  return params.get('logout_token');
}

/**
 * Handle POST requests for backchannel logout.
 * If a user logs out from another client, the IDP will send a POST request to this endpoint.
 * The body must contain a logout_token as string which contains the session id (sid).
 * @param req
 * @returns
 */
export async function POST(req: NextRequest) {
  try {
    logInfo('Received backchannel logout request');
    const logoutToken = await getLogoutTokenFromRequest(req);
    if (!logoutToken) {
      logWarning('No logout_token found in request body');
      return NextResponse.json({ error: 'No logout_token found in request body' }, { status: 400 });
    }

    const jwks = await getVidisJwks();
    let sessionId: string;
    try {
      const { payload } = await jwtVerify(logoutToken, jwks, {
        issuer: env.vidisIssuerUri,
        audience: env.vidisClientId,
        maxTokenAge: '5 minutes',
      });
      sessionId = logoutTokenSchema.parse(payload).sid;
    } catch (error) {
      logWarning('Rejected backchannel logout request with invalid logout_token', { error });
      return NextResponse.json({ error: 'Invalid logout_token' }, { status: 401 });
    }

    await sessionBlockList.add(sessionId);

    return new Response('OK', { status: 200 });
  } catch (error) {
    logError('Error processing backchannel logout', error);
    return NextResponse.json({ error: 'Error processing backchannel logout' }, { status: 500 });
  }
}
