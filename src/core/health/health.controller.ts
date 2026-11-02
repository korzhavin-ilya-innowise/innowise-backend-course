import { Controller, Get } from '@nestjs/common';
import { HealthCheck } from '@nestjs/terminus';

import { HealthService } from './health.service';
import { ReadinessService } from './readiness.service';
import { ConfigService } from '@/core/config/config.service';
import { AppException } from '@/core/errors/app.exception';

@Controller('health')
export class HealthController {
  constructor(
    private readonly healthService: HealthService,
    private readonly readinessService: ReadinessService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  async check() {
    const healthCheckEnabled = this.configService.get('HEALTH_CHECK_ENABLED');

    if (!healthCheckEnabled) {
      return this.healthService.getEmptyResponse();
    }

    return this.healthService.checkHealth();
  }

  /** Readiness: 503 while any subsystem reports a startup/config failure. */
  @Get('ready')
  ready() {
    if (!this.readinessService.isReady()) {
      throw AppException.serviceUnavailable('Service is not ready');
    }
    return { status: 'ok' };
  }
}
