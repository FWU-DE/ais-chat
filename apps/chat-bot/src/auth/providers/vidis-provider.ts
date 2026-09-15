import { dbGetUserById } from '@ais-chat/shared/db/functions/user';
import { env } from '@/env';
import { createRemoteJWKSet } from 'jose';
import { customFetch as nextAuthCustomFetch } from 'next-auth';
import type { Account, NextAuthConfig, Profile } from 'next-auth';
import type { JWT } from 'next-auth/jwt';
import {
  allowInsecureRequests,
  customFetch as oauthCustomFetch,
  discoveryRequest,
  processDiscoveryResponse,
} from 'oauth4webapi';
import { vidisAccountSchema, vidisProfileSchema } from './vidis-schema';
export { validateAndSyncVidisUser } from './validate-and-sync-vidis-user';

export const VIDIS_LOGOUT_URL = new URL(env.vidisIssuerUri + '/protocol/openid-connect/logout');

export async function handleVidisJWTCallback({
  profile,
  token,
  account,
}: {
  profile: Profile;
  token: JWT;
  account: Account;
}) {
  const parsedProfile = vidisProfileSchema.parse(profile);
  const parsedAccount = vidisAccountSchema.parse(account);

  const existingUser = await dbGetUserById({ userId: parsedProfile.sub });
  if (!existingUser) {
    throw new Error('Could not find synchronized VIDIS user');
  }

  token.userId = existingUser.id;
  token.id_token = parsedAccount.id_token;
  token.hasCompletedTraining = parsedProfile.is_ai_chat_eligible ?? false;
  return token;
}

const OIDC_DISCOVERY_REVALIDATE_SECONDS = 5 * 60; // 5 minutes

/**
 * Custom fetch that caches the OIDC discovery document (.well-known/openid-configuration)
 * using Next.js's built-in Data Cache via `next.revalidate`.
 * All other requests are passed through to the standard fetch.
 *
 * Without caching, auth.js fetches the discovery document on every auth operation,
 * which can take 200ms–10s depending on the VIDIS server response time.
 */
async function cachedDiscoveryFetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
  const input = args[0];
  let url: URL;

  if (input instanceof Request) {
    url = new URL(input.url);
  } else if (input instanceof URL) {
    url = input;
  } else {
    const inputStr = String(input);
    try {
      url = new URL(inputStr);
    } catch {
      url = new URL(inputStr, env.vidisIssuerUri);
    }
  }

  if (!url.pathname.endsWith('/.well-known/openid-configuration')) {
    return fetch(...args);
  }

  // If the cache is stale, this will serve the stale cache, before revalidating and updating the cache for subsequent requests.
  return fetch(url, {
    ...args[1],
    next: { revalidate: OIDC_DISCOVERY_REVALIDATE_SECONDS },
  });
}

let vidisJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

/**
 * Resolve VIDIS's JWKS (JSON Web Key Set) via the OIDC discovery document, used to verify
 * the signature of tokens issued by VIDIS (e.g. backchannel logout tokens).
 * Discovery is performed with `oauth4webapi` (the OIDC client library next-auth itself uses
 * internally), which validates the discovery document against the issuer.
 * The resulting key set is cached for the lifetime of the process; `createRemoteJWKSet`
 * itself caches and rate-limits the underlying JWKS fetches.
 */
export async function getVidisJwks() {
  if (!vidisJwks) {
    const issuer = new URL(env.vidisIssuerUri);
    const discoveryResponse = await discoveryRequest(issuer, {
      [allowInsecureRequests]: env.vidisAllowInsecureDiscovery,
      [oauthCustomFetch]: cachedDiscoveryFetch,
    });
    const authorizationServer = await processDiscoveryResponse(issuer, discoveryResponse);
    if (!authorizationServer.jwks_uri) {
      throw new Error('VIDIS discovery document does not provide a jwks_uri');
    }
    const jwksUri = new URL(authorizationServer.jwks_uri);
    if (jwksUri.protocol !== 'https:' && !env.vidisAllowInsecureDiscovery) {
      throw new Error('Refusing to fetch VIDIS JWKS over an insecure connection');
    }
    vidisJwks = createRemoteJWKSet(jwksUri);
  }
  return vidisJwks;
}

export const vidisConfig = {
  id: 'vidis',
  name: 'vidis',
  type: 'oidc',
  wellKnown: `${env.vidisIssuerUri}/.well-known/openid-configuration`,
  authorization: { params: { scope: 'openid' } },
  idToken: true,
  checks: ['pkce', 'state'],
  clientId: env.vidisClientId,
  clientSecret: env.vidisClientSecret,
  issuer: env.vidisIssuerUri,
  [nextAuthCustomFetch]: cachedDiscoveryFetch,
} satisfies NextAuthConfig['providers'][number];
