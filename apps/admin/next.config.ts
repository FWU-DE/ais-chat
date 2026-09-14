import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs/config';

const isDevBuild = process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development';

const baseNextConfig: NextConfig = {
  deploymentId: process.env.APP_VERSION,
  reactStrictMode: true,
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
  productionBrowserSourceMaps: !isDevBuild,
  experimental: {
    useCache: true,
    // Speed up dev builds by pre-bundling heavy packages instead of re-resolving on every HMR
    optimizePackageImports: ['@ais-chat/ui', '@ais-chat/shared', '@ais-chat/ai-core'],
    // Run the React Compiler natively inside Turbopack instead of via Babel
    turbopackRustReactCompiler: true,
  },
};

export default withSentryConfig(baseNextConfig, {
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
