import 'dotenv/config';

import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

/**
 * OpenTelemetry bootstrap. Must be the FIRST import in main.ts so that
 * http/fastify/pg are patched before they are loaded.
 * Enabled only when OTEL_EXPORTER_OTLP_ENDPOINT is set (OTLP/HTTP, port 4318).
 */
let sdk: NodeSDK | undefined;

if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  process.env.OTEL_SERVICE_NAME ??= 'kubota-backend';
  process.env.OTEL_RESOURCE_ATTRIBUTES ??= `deployment.environment=${process.env.NODE_ENV ?? 'development'}`;

  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReaders: [
      new PeriodicExportingMetricReader({ exporter: new OTLPMetricExporter() }),
    ],
    instrumentations: [
      getNodeAutoInstrumentations({
        // noisy and not useful
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
