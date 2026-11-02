import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from '@/modules/users/user.entity';

import { AuthController } from './auth.controller';
import { ChallengeCryptoService } from './challenge-crypto.service';
import { EmailService, SmtpEmailService } from './email/email.service';
import { LoginChallenge } from './login-challenge.entity';
import { PasswordService } from './password.service';
import { RegistrationChallenge } from './registration-challenge.entity';
import { RegistrationService } from './registration.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, RegistrationChallenge, LoginChallenge]),
  ],
  controllers: [AuthController],
  providers: [
    RegistrationService,
    ChallengeCryptoService,
    PasswordService,
    { provide: EmailService, useClass: SmtpEmailService },
  ],
  exports: [PasswordService, ChallengeCryptoService, EmailService],
})
export class AuthModule {}
