import { Global, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { ReadinessService } from './readiness.service';

@Global()
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [HealthService, ReadinessService],
  exports: [ReadinessService],
})
export class HealthModule {}
