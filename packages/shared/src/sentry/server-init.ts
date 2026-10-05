import Sentry from '@sentry/nextjs';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { scrubSentryEvent } from '@ais-chat/shared-core/sentry/scrub';
import { registerCleanupHandler } from '../shutdown/cleanup';
import { env } from './env';

/**
 * Initializes Sentry and OpenTelemetry for server-side application.
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
    debug: false,
    dsn: env.sentryDsn,
    environment: env.sentryEnvironment,
    integrations: [
      Sentry.captureConsoleIntegration({ levels: ['fatal', 'error', 'warn', 'info'] }),
      Sentry.openTelemetryIntegration(),
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
    // Use custom OpenTelemetry configuration, see https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/
    enableOpenTelemetrySetup: false,
    enableRuntimeChannelInjection: false,
  });
  const sentryTraceEndpoint = env.sentryDsn
    ? Sentry.getOtlpTracesEndpoint(env.sentryDsn)
    : undefined;

  // For debugging purposes, you can uncomment the following two lines to enable console logging
  // import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
  // diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

  const exporter = new OTLPMetricExporter();
  const periodicExportingMetricReader = new PeriodicExportingMetricReader({
    exporter,
    exportIntervalMillis: env.otelMetricExportInterval,
    exportTimeoutMillis: env.otelMetricExportTimeout,
  });

  // Documentation for the OpenTelemetry SDK for Node.js can be found here:
  // https://www.npmjs.com/package/@opentelemetry/sdk-node
  const sdk = new NodeSDK({
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          requestHook: (span, msg) => {
            const path = 'path' in msg ? msg.path : msg.url;
            span.updateName(`${msg.method} ${path}`);
          },
        },
      }),
    ],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: env.appVersion,
    }),
    metricReaders: [periodicExportingMetricReader],
    serviceName: serviceName,
    spanProcessors: [
      new BatchSpanProcessor(new OTLPTraceExporter()),
      ...(sentryTraceEndpoint
        ? [new BatchSpanProcessor(new OTLPTraceExporter(sentryTraceEndpoint))]
        : []),
    ],
  });

  sdk.start();

  registerCleanupHandler(async () => {
    console.log('[shutdown] Shutting down OpenTelemetry SDK...');
    await sdk.shutdown();
    console.log('[shutdown] OpenTelemetry SDK shutdown completed');
  });
}
