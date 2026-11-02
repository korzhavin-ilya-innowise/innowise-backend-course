import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckService, TypeOrmHealthIndicator } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ReadinessService } from './readiness.service';
import { ConfigService } from '@/core/config/config.service';

describe('HealthController', () => {
  let controller: HealthController;
  let readiness: ReadinessService;
  let healthEnabled: boolean;

  beforeEach(async () => {
    healthEnabled = false;
    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        HealthService,
        ReadinessService,
        { provide: ConfigService, useValue: { get: () => healthEnabled } },
        { provide: HealthCheckService, useValue: { check: jest.fn() } },
        { provide: TypeOrmHealthIndicator, useValue: { pingCheck: jest.fn() } },
      ],
    }).compile();

    controller = module.get(HealthController);
    readiness = module.get(ReadinessService);
  });

  it('returns empty ok when health checks are disabled', async () => {
    await expect(controller.check()).resolves.toEqual({
      status: 'ok',
      details: {},
    });
  });

  it('ready: ok by default', async () => {
    await expect(
      Promise.resolve().then(() => controller.ready()),
    ).resolves.toEqual({ status: 'ok' });
  });

  it('ready: 503 after a subsystem reports failure, recovers after markOk', async () => {
    readiness.markFailed('routes', 'route without access decorator');
    await expect(
      Promise.resolve().then(() => controller.ready()),
    ).rejects.toMatchObject({ status: 503 });
    readiness.markOk('routes');
    await expect(
      Promise.resolve().then(() => controller.ready()),
    ).resolves.toEqual({ status: 'ok' });
  });
});
