import NextAuth, { NextAuthResult } from 'next-auth';
import KeycloakProvider from 'next-auth/providers/keycloak';
import { NextResponse } from 'next/server';
import { env } from '@/consts/env';
import { withTrustedOrigin } from '@shared/utils/with-trusted-origin';
import { AdminRole, getAdminRoleFromClaims } from '@/auth/roles';

function getClaimsFromToken(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) {
    return {};
  }

  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return {};
  }
}

declare module 'next-auth' {
  interface Session {
    idToken?: string; // needed for logout at identity provider (keycloak)
    adminRole?: AdminRole;
  }
}

// Default provider for stage and prod
const keycloakProvider = KeycloakProvider({
  // https://next-auth.js.org/configuration/providers/oauth#userinfo-option
  idToken: true, // preferred way to get some user information, otherwise an additional request is send
  clientId: env.keycloakClientId,
  clientSecret: env.keycloakClientSecret,
  issuer: env.keycloakIssuer,
});

const result = NextAuth({
  providers: [keycloakProvider],
  trustHost: true,
  callbacks: {
    async signIn() {
      return true;
    },
    async authorized({ auth, request }) {
      if (auth) {
        return true;
      }

      const trustedRequest = withTrustedOrigin(request);
      const signInUrl = new URL('/api/auth/signin', trustedRequest.url);
      const relativeCallbackUrl = `${trustedRequest.nextUrl.pathname}${trustedRequest.nextUrl.search}`;
      signInUrl.searchParams.set('callbackUrl', relativeCallbackUrl || '/');

      return NextResponse.redirect(signInUrl);
    },
    async jwt({ token, account, profile }) {
      // Capture idToken from account during sign-in
      if (account?.id_token) {
        token.id_token = account.id_token;
      }
      const idToken =
        account?.id_token ?? (typeof token.id_token === 'string' ? token.id_token : undefined);
      const idTokenClaims = idToken ? getClaimsFromToken(idToken) : {};
      const adminRole = getAdminRoleFromClaims({
        ...profile,
        ...idTokenClaims,
      });
      if (adminRole) {
        token.adminRole = adminRole;
      } else {
        delete token.adminRole;
      }
      return token;
    },
    async session({ session, token }) {
      // Pass idToken from token to session for logout flow
      if (token?.id_token) {
        session.idToken = token.id_token as string;
      }
      if (token?.adminRole) {
        session.adminRole = token.adminRole as AdminRole;
      }
      return session;
    },
  },
});

export const handlers: NextAuthResult['handlers'] = result.handlers;
export const auth: NextAuthResult['auth'] = result.auth;
export const signIn: NextAuthResult['signIn'] = result.signIn;
export const signOut: NextAuthResult['signOut'] = result.signOut;
