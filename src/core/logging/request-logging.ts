import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { IncomingMessage } from 'node:http';

export const REQUEST_ID_HEADER = 'x-request-id';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** Accept a client-supplied request id only if it has a safe format. */
export function resolveRequestId(req: Pick<IncomingMessage, 'headers'>) {
  const incoming = req.headers[REQUEST_ID_HEADER];
  if (typeof incoming === 'string' && REQUEST_ID_PATTERN.test(incoming)) {
    return incoming;
  }
  return randomUUID();
}

/**
 * Echoes the request id in the response and writes one access-log line per
 * request after the response is sent, so the final status (including errors
 * produced by guards and the exception filter) is visible.
 *
 * Never logs query string, headers, cookies or bodies (may hold secrets/PII).
 */
export function registerRequestLogging(app: NestFastifyApplication) {
  const logger = new Logger('HTTP');
  const fastify = app.getHttpAdapter().getInstance();

  fastify.addHook('onRequest', (request, reply, done) => {
    void reply.header(REQUEST_ID_HEADER, request.id);
    done();
  });

  fastify.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? 'unmatched';
    const status = reply.statusCode;
    const spanContext = trace.getActiveSpan()?.spanContext();
    const line = JSON.stringify({
      requestId: request.id,
      trace_id: spanContext?.traceId,
      span_id: spanContext?.spanId,
      method: request.method,
      route,
      path: request.url.split('?')[0],
      status,
      durationMs: Math.round(reply.elapsedTime),
    });
    if (route.startsWith('/health') && status < 400) logger.debug(line);
    else if (status >= 500) logger.error(line);
    else if (status >= 400) logger.warn(line);
    else logger.log(line);
    done();
  });
}
