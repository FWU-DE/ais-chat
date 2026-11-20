import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  clientPrefix: '',
  client: {},
  emptyStringAsUndefined: true,
  server: {
    appVersion: z.string().default('0.0.0'),
    otelMetricExportEndpoint: z.string().optional(),
    otelMetricExportInterval: z.coerce.number().default(60000),
    otelMetricExportTimeout: z.coerce.number().default(30000),
    sentryDsn: z.string().optional(),
    sentryEnvironment: z.string().optional(),
    sentryTracesSampleRate: z.coerce.number().default(1.0),
    sentryTracesSampleRateAi: z.coerce.number().default(1.0),
    sentryTracesSampleRateClient: z.coerce.number().default(0.01),
  },
  runtimeEnv: {
    appVersion: process.env.APP_VERSION,
    otelMetricExportEndpoint: process.env.OTEL_EXPORTER_OTLP_METRICS_ENDPOINT,
    otelMetricExportInterval: process.env.OTEL_METRIC_EXPORT_INTERVAL,
    otelMetricExportTimeout: process.env.OTEL_METRIC_EXPORT_TIMEOUT,
    sentryDsn: process.env.SENTRY_DSN,
    sentryEnvironment: process.env.SENTRY_ENVIRONMENT,
    sentryTracesSampleRate: process.env.SENTRY_TRACES_SAMPLE_RATE,
    sentryTracesSampleRateAi: process.env.SENTRY_TRACES_SAMPLE_RATE_AI,
    sentryTracesSampleRateClient: process.env.SENTRY_TRACES_SAMPLE_RATE_CLIENT,
  },
});
