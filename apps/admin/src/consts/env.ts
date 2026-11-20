import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  emptyStringAsUndefined: true,
  server: {
    bifrostAdminUrl: z.url().optional(),
    bifrostAdminUsername: z.string().optional(),
    bifrostAdminPassword: z.string().optional(),
    databaseUrl: z.string(),
    keycloakClientId: z.string(),
    keycloakClientSecret: z.string(),
    keycloakIssuer: z.string(),
  },
  client: {},
  runtimeEnv: {
    bifrostAdminUrl: process.env.BIFROST_ADMIN_URL,
    bifrostAdminUsername: process.env.BIFROST_ADMIN_USERNAME,
    bifrostAdminPassword: process.env.BIFROST_ADMIN_PASSWORD,
    databaseUrl: process.env.DATABASE_URL,
    keycloakClientId: process.env.KEYCLOAK_CLIENT_ID,
    keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET,
    keycloakIssuer: process.env.KEYCLOAK_ISSUER,
  },
});
