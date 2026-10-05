import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';
import FastifyOtelInstrumentation from '@fastify/otel';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { scrubSentryEvent } from '@ais-chat/shared-core/sentry/scrub';
import { env } from '@/env';
import { logger } from '@/logger';

Sentry.init({
  dsn: env.sentryDsn,
  integrations: (integrations) => [
    // exclude Fastify, to prevent duplicate registration from ./instrumentation.node
    ...integrations.filter((i) => i.name !== 'Fastify'),
    nodeProfilingIntegration(),
    Sentry.openTelemetryIntegration(),
    Sentry.httpIntegration({ spans: false }),
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
  // Use custom OpenTelemetry configuration, see https://docs.sentry.io/platforms/javascript/guides/node/opentelemetry/custom-setup/
  enableOpenTelemetrySetup: false,
  enableRuntimeChannelInjection: false,
});

// For debugging purposes, you can uncomment the following two lines to enable console logging
// import { diag, DiagConsoleLogger, DiagLogLevel } from '@opentelemetry/api';
// diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.DEBUG);

const SERVICE_NAME = 'ais-chat-api';
const sentryTraceEndpoint = env.sentryDsn ? Sentry.getOtlpTracesEndpoint(env.sentryDsn) : undefined;

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
    new FastifyOtelInstrumentation({ registerOnInitialization: true }),
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-dns': {
        // Disable dns instrumentation, as it creates single spans without parents
        enabled: false,
      },
      '@opentelemetry/instrumentation-http': {
        requestHook: (span, msg) => {
          const path = 'path' in msg ? msg.path : msg.url;
          span.updateName(`${msg.method} ${path}`);
        },
      },
    }),
  ],
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: env.appVersion,
  }),
  metricReaders: [periodicExportingMetricReader],
  serviceName: SERVICE_NAME,
  spanProcessors: [
    new BatchSpanProcessor(new OTLPTraceExporter()),
    ...(sentryTraceEndpoint
      ? [new BatchSpanProcessor(new OTLPTraceExporter(sentryTraceEndpoint))]
      : []),
  ],
});

sdk.start();

export async function shutdownTracing() {
  try {
    await sdk.shutdown();
    logger.debug('Tracing terminated');
  } catch (error) {
    logger.error(error, 'Error terminating tracing');
  }
}

export async function flushSentry(timeout = 10_000) {
  await Sentry.flush(timeout);
}
