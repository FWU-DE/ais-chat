import { metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { MeterProvider, PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

export function initMetrics({
  exportEndpoint,
  exportIntervalMillis,
  exportTimeoutMillis,
  serviceName,
  serviceVersion,
}: {
  exportEndpoint?: string;
  exportIntervalMillis: number;
  exportTimeoutMillis: number;
  serviceName: string;
  serviceVersion: string;
}) {
  const meterProvider = new MeterProvider({
    readers: [
      new PeriodicExportingMetricReader({
        exporter: new OTLPMetricExporter(exportEndpoint ? { url: exportEndpoint } : undefined),
        exportIntervalMillis,
        exportTimeoutMillis,
      }),
    ],
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: serviceVersion,
    }),
  });

  metrics.setGlobalMeterProvider(meterProvider);

  return () => meterProvider.shutdown();
}
