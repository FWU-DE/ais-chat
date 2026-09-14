import { withSentryConfig } from '@sentry/nextjs/config';
import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const isDevBuild = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

const baseNextConfig: NextConfig = {
  deploymentId: process.env.APP_VERSION,
  transpilePackages: [
    '@ais-chat/ui',
    '@ais-chat/shared',
    '@ais-chat/shared-core',
    '@ais-chat/api-database',
    '@ais-chat/ai-core',
    'import-in-the-middle',
    '@t3-oss/env-nextjs',
    '@t3-oss/env-core',
  ],
  typescript: {
    // should be checked in the pipeline anyway and takes a lot of time during build
    ignoreBuildErrors: true,
  },
  // if you do not host it on vercel for serverless environment enable this option
  // if you want to host it on vercel, remove this option
  // https://nextjs.org/docs/app/api-reference/config/next-config-js/output#automatically-copying-traced-files
  output: 'standalone',
  reactCompiler: true,
  images: {
    // When images are hosted on the same cloud as the application, access is routed on the local network and needs to be allowed
    dangerouslyAllowLocalIP: true,
    dangerouslyAllowSVG: true,
    // Set recommended security headers to prevent XSS with SVGs
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  productionBrowserSourceMaps: !isDevBuild,
  experimental: {
    useCache: true,
    // Speed up dev builds by pre-bundling heavy packages instead of re-resolving on every HMR
    optimizePackageImports: ['@ais-chat/ui', '@ais-chat/shared', '@ais-chat/ai-core'],
    // Run the React Compiler natively inside Turbopack instead of via Babel
    turbopackRustReactCompiler: true,
  },
  turbopack: {
    rules: {
      // Treat plain SVG imports as React components and `?url` imports as asset URLs.
      '*.svg': [
        {
          condition: {
            all: [{ not: 'foreign' }, { query: /url/ }],
          },
          type: 'asset',
        },
        {
          condition: {
            all: [{ not: 'foreign' }, { not: { query: /url/ } }],
          },
          loaders: [
            {
              loader: '@svgr/webpack',
              options: {
                exportType: 'default',
              },
            },
          ],
          as: '*.js',
        },
      ],
    },
  },
  async redirects() {
    return [
      {
        source: '/custom',
        destination: '/assistants',
        permanent: true,
      },
      {
        source: '/custom/d/:gptId',
        destination: '/assistants/d/:gptId',
        permanent: true,
      },
      {
        source: '/custom/d/:gptId/:conversationId',
        destination: '/assistants/d/:gptId/:conversationId',
        permanent: true,
      },
      {
        source: '/shared-chats',
        destination: '/learning-scenarios',
        permanent: true,
      },
      {
        source: '/shared-chats/:path*',
        destination: '/learning-scenarios/:path*',
        permanent: true,
      },
      {
        source: '/ua/shared-chats/:path*',
        destination: '/ua/learning-scenarios/:path*',
        permanent: true,
      },
    ];
  },
} satisfies NextConfig;

const withNextIntl = createNextIntlPlugin();

const baseNextConfigWithNextIntl = withNextIntl(baseNextConfig);

export default withSentryConfig(baseNextConfigWithNextIntl, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  sentryUrl: process.env.SENTRY_URL,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  debug: true,

  release: {
    create: !isDevBuild,
    setCommits: {
      auto: true,
      ignoreEmpty: true,
      ignoreMissing: true,
    },
  },

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  sourcemaps: {
    disable: isDevBuild,
  },

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  // widenClientFileUpload: true,

  webpack: {
    // Automatically annotate React components to show their full name in breadcrumbs and session replay
    reactComponentAnnotation: {
      enabled: true,
    },

    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
