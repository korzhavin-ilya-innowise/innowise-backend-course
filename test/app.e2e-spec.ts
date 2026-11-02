import { Test } from '@nestjs/testing';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';
import { Controller, Get } from '@nestjs/common';

import type { ErrorBody } from '@/core/errors/all-exceptions.filter';
import { ErrorsModule } from '@/core/errors/errors.module';
import { HealthModule } from '@/core/health/health.module';
import { ConfigService } from '@/core/config/config.service';
import { ReadinessService } from '@/core/health/readiness.service';
import {
  registerRequestLogging,
  resolveRequestId,
} from '@/core/logging/request-logging';

@Controller('boom')
class BoomController {
  @Get()
  boom() {
    throw new Error('internal secret');
  }
}

describe('Foundation (e2e, Fastify)', () => {
  let app: NestFastifyApplication;
  let readiness: ReadinessService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [HealthModule, ErrorsModule],
      controllers: [BoomController],
    })
      .useMocker((token) => {
        if (token === ConfigService) return { get: () => false };
        if (token === HealthCheckService) return { check: jest.fn() };
        if (token === TypeOrmHealthIndicator) return { pingCheck: jest.fn() };
      })
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter({ genReqId: resolveRequestId }),
    );
    registerRequestLogging(app);
    readiness = app.get(ReadinessService);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(() => app.close());

  it('GET /health -> 200 and echoes generated X-Request-Id', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('keeps a valid client request id, replaces an invalid one', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'client-req-12345' },
    });
    expect(ok.headers['x-request-id']).toBe('client-req-12345');

    const bad = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { 'x-request-id': 'bad id\twith spaces' },
    });
    expect(bad.headers['x-request-id']).not.toBe('bad id\twith spaces');
  });

  it('unknown route -> unified 404 body', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.json<ErrorBody>()).toMatchObject({
      statusCode: 404,
      code: 'not_found',
      requestId: res.headers['x-request-id'],
    });
  });

  it('unhandled error -> 500 without leaking internals', async () => {
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret');
    expect(res.json<ErrorBody>().code).toBe('internal_error');
  });

  it('/health/ready flips to 503 when readiness fails', async () => {
    expect((await app.inject({ url: '/health/ready' })).statusCode).toBe(200);
    readiness.markFailed('test', 'x');
    const res = await app.inject({ url: '/health/ready' });
    expect(res.statusCode).toBe(503);
    expect(res.json<ErrorBody>().code).toBe('service_unavailable');
  });
});
