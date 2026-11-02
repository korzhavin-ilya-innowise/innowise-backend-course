import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { FastifyReply } from 'fastify';

import {
  ConfirmRegistrationDto,
  RegisterDto,
  ResendDto,
} from './dto/register.dto';
import { RegistrationService } from './registration.service';

const LIMIT = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  constructor(private readonly registration: RegistrationService) {}

  @Post('register')
  @Throttle(LIMIT)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const result = await this.registration.register(dto.email, dto.password);
    reply.status('confirmationRequired' in result ? 202 : 201);
    return result;
  }

  @Post('register/confirm')
  @HttpCode(200)
  @Throttle(LIMIT)
  confirm(@Body() dto: ConfirmRegistrationDto) {
    return this.registration.confirm(dto);
  }

  @Post('register/resend')
  @HttpCode(202)
  @Throttle(LIMIT)
  resend(@Body() dto: ResendDto) {
    return this.registration.resend(dto.email);
  }
}
