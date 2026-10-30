import { metrics } from '@opentelemetry/api';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import {
  AggregationType,
  InstrumentType,
  MeterProvider,
  PeriodicExportingMetricReader,
  type ViewOptions,
} from '@opentelemetry/sdk-metrics';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { registerProcessMemoryMetrics } from './process-memory';

const MIB = 1024 * 1024;

/**
 * The SDK default boundaries top out at 10000, which collapses every byte-scale sample into the
 * +Inf bucket. Byte histograms carry magnitudes only, because the SDK drops negative values.
 */
const byteHistogramView: ViewOptions = {
  instrumentType: InstrumentType.HISTOGRAM,
  instrumentUnit: 'By',
  aggregation: {
    type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
    options: {
      boundaries: [
        0,
        MIB,
        5 * MIB,
        10 * MIB,
        25 * MIB,
        50 * MIB,
        100 * MIB,
        250 * MIB,
        500 * MIB,
        1024 * MIB,
      ],
    },
  },
};

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
    views: [byteHistogramView],
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

  registerProcessMemoryMetrics();

  return () => meterProvider.shutdown();
}
