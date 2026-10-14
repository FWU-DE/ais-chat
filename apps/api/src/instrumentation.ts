import { env } from '@/env';
import { logger } from '@/logger';
import { initMetrics } from '@ais-chat/shared-core/metrics/init';
import { scrubSentryEvent } from '@ais-chat/shared-core/sentry/scrub';
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

const SERVICE_NAME = 'ais-chat-api';

Sentry.init({
  dsn: env.sentryDsn,
  integrations: (integrations) => [
    ...integrations,
    nodeProfilingIntegration(),
    Sentry.pinoIntegration({
      // publish fatal and error logs as events
      error: { levels: ['fatal', 'error'] },
    }),
  ],
  tracesSampler: ({ inheritOrSampleWith, attributes }) => {
    const pathname = attributes?.['http.target'] ?? attributes?.['http.route'] ?? '';

    const isExcludedUrl = pathname === '/health';
    if (isExcludedUrl) {
      return 0;
    }

    return inheritOrSampleWith(env.sentryTracesSampleRate);
  },
  beforeSend: (event) => scrubSentryEvent(event),
  beforeBreadcrumb: (breadcrumb) => scrubSentryEvent(breadcrumb),
  beforeSendTransaction: (event) => scrubSentryEvent(event),
  profileSessionSampleRate: env.sentryProfileSessionSampleRate,
  profileLifecycle: 'trace',
  environment: env.sentryEnvironment,
  // Ensure that only traces from your own organization are continued
  strictTraceContinuation: true,
  enableOpenTelemetrySetup: true,
  enableRuntimeChannelInjection: false,
});

const shutdownOpenTelemetryMetrics = initMetrics({
  exportIntervalMillis: env.otelMetricExportInterval,
  exportTimeoutMillis: env.otelMetricExportTimeout,
  serviceName: SERVICE_NAME,
  serviceVersion: env.appVersion,
});

export async function shutdownMetrics() {
  try {
    await shutdownOpenTelemetryMetrics();
    logger.debug('Metrics terminated');
  } catch (error) {
    logger.error(error, 'Error terminating metrics');
  }
}

export async function flushSentry(timeout = 10_000) {
  await Sentry.flush(timeout);
}
