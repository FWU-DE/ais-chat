import { initMetrics } from '@ais-chat/shared-core/metrics/init';
import { scrubSentryEvent } from '@ais-chat/shared-core/sentry/scrub';
import Sentry from '@sentry/nextjs';
import { registerCleanupHandler } from '../shutdown/cleanup';
import { env } from './env';

/**
 * Initializes Sentry tracing and OpenTelemetry metrics for a server-side application.
 */
export function initSentry({
  scrubSensitiveData = true,
  aiServerActionNames = [],
  serviceName,
  traceExcludedUrls,
}: {
  serviceName: string;
  /** List of URL paths, which should not be traced */
  traceExcludedUrls: string[];
  /**
   * Server Action names that are known to call LLM/AI services.
   * These actions will be traced with a different sampling rate.
   */
  aiServerActionNames?: string[];
  /** Whether to scrub sensitive data from Sentry events before sending */
  scrubSensitiveData?: boolean;
}) {
  const aiServerActionNameSet = new Set(aiServerActionNames.map((name) => `serverAction/${name}`));

  Sentry.init({
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    initialScope: {
      tags: {
        'service.name': serviceName,
        'service.version': env.appVersion,
      },
    },
    integrations: [
      Sentry.captureConsoleIntegration({ levels: ['fatal', 'error', 'warn', 'info'] }),
    ],
    tracesSampler: ({ name, normalizedRequest, inheritOrSampleWith }) => {
      const url = normalizedRequest?.url ?? '';
      // Extract pathname if it's a full URL, otherwise use as-is
      const pathname = url.startsWith('http') ? new URL(url).pathname : url.split('?')[0];

      const isExcludedUrl = traceExcludedUrls.includes(pathname ?? '');
      if (isExcludedUrl) {
        return 0;
      }

      // If parent was sampled, honor that decision
      const parentSamplingDecision = inheritOrSampleWith(0);
      if (parentSamplingDecision) {
        return true;
      }

      // Parent was not sampled or absent, use backend's own sampling rates
      if (aiServerActionNameSet.has(name)) {
        return env.sentryTracesSampleRateAi;
      }

      return env.sentryTracesSampleRate;
    },
    ...(scrubSensitiveData && {
      beforeBreadcrumb: (breadcrumb) => scrubSentryEvent(breadcrumb),
      beforeSend: (event) => scrubSentryEvent(event),
      beforeSendTransaction: (event) => scrubSentryEvent(event),
    }),
    // Kept explicit: the RabbitMQ publisher traces via the OpenTelemetry API and needs this provider.
    enableOpenTelemetrySetup: true,
  });

  const shutdownMetrics = initMetrics({
    exportEndpoint: env.otelMetricExportEndpoint,
    exportIntervalMillis: env.otelMetricExportInterval,
    exportTimeoutMillis: env.otelMetricExportTimeout,
    serviceName,
    serviceVersion: env.appVersion,
  });

  registerCleanupHandler(async () => {
    console.log('[shutdown] Shutting down OpenTelemetry metrics...');
    try {
      await shutdownMetrics();
      console.log('[shutdown] OpenTelemetry metrics shutdown completed');
    } finally {
      await Sentry.flush(10_000);
    }
  });
}
