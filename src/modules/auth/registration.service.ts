import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';

import { ConfigService } from '@/core/config/config.service';
import { AppException } from '@/core/errors/app.exception';
import { User, UserStatus } from '@/modules/users/user.entity';

import { ChallengeCryptoService } from './challenge-crypto.service';
import {
  CHALLENGE_TTL_SECONDS,
  ChallengeMethod,
  ConsumedReason,
  MAX_OTP_ATTEMPTS,
  RESEND_COOLDOWN_SECONDS,
} from './challenge.types';
import { ConfirmRegistrationDto } from './dto/register.dto';
import { EmailService } from './email/email.service';
import { PasswordService } from './password.service';
import { RegistrationChallenge } from './registration-challenge.entity';

export interface RegisteredUser {
  id: string;
  email: string;
  status: UserStatus;
}

export interface ConfirmationRequired {
  confirmationRequired: true;
  method: ChallengeMethod;
  attemptId: string;
  expiresInSeconds: number;
  resendAfterSeconds: number;
}

const INVALID_CODE_MESSAGE = 'Invalid or expired confirmation';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService,
    private readonly crypto: ChallengeCryptoService,
    private readonly passwords: PasswordService,
    private readonly email: EmailService,
  ) {}

  private get confirmationEnabled(): boolean {
    return (
      String(this.config.get('REGISTRATION_EMAIL_CONFIRMATION_ENABLED')) ===
      'true'
    );
  }

  private get method(): ChallengeMethod {
    return String(this.config.get('REGISTRATION_CONFIRMATION_METHOD')) ===
      'magic_link'
      ? ChallengeMethod.MagicLink
      : ChallengeMethod.Otp;
  }

  async register(
    email: string,
    password: string,
  ): Promise<RegisteredUser | ConfirmationRequired> {
    const passwordHash = await this.passwords.hash(password);
    const enabled = this.confirmationEnabled;

    // Unique index violations (also from races) surface as PG 23505 -> 409
    // via the global exception filter.
    const exists = await this.dataSource
      .getRepository(User)
      .exists({ where: { email } });
    if (exists) throw AppException.conflict('Email is already registered');

    const created = await this.dataSource.transaction(async (em) => {
      const user = await em.save(
        em.create(User, {
          email,
          passwordHash,
          status: enabled ? UserStatus.Pending : UserStatus.Active,
        }),
      );
      // TODO(phase 2): assign the `user` role here when confirmation is off.
      const issued = enabled
        ? await this.issueChallenge(em, user.id)
        : undefined;
      return { user, issued };
    });

    if (!created.issued) {
      return { id: created.user.id, email, status: UserStatus.Active };
    }
    const { attemptId, secret } = created.issued;
    await this.deliver(email, attemptId, secret);
    return this.confirmationResponse(attemptId);
  }

  async confirm(dto: ConfirmRegistrationDto): Promise<RegisteredUser> {
    // Failed attempts must be committed, so the transaction returns null
    // for "invalid" and the 400 is thrown after commit.
    let attemptId: string;
    let secret: string;
    if (dto.token) {
      const dot = dto.token.indexOf('.');
      attemptId = dto.token.slice(0, dot);
      secret = dto.token.slice(dot + 1);
      if (dot < 1 || !secret || !UUID_RE.test(attemptId)) {
        throw AppException.badRequest(INVALID_CODE_MESSAGE);
      }
    } else {
      attemptId = dto.attemptId!;
      secret = dto.code!;
    }

    return this.dataSource
      .transaction(async (em) => {
        const challenge = await em.findOne(RegistrationChallenge, {
          where: { id: attemptId },
          lock: { mode: 'pessimistic_write' },
        });
        const now = new Date();

        if (!challenge) throw AppException.badRequest(INVALID_CODE_MESSAGE);
        if (challenge.consumedAt) {
          if (challenge.consumedReason === ConsumedReason.AttemptsExhausted) {
            throw AppException.rateLimitExceeded('Too many attempts');
          }
          throw AppException.badRequest(INVALID_CODE_MESSAGE);
        }
        if (challenge.expiresAt <= now) {
          throw AppException.badRequest(INVALID_CODE_MESSAGE);
        }

        if (!this.crypto.verify(challenge.id, secret, challenge.secretHash)) {
          challenge.attempts += 1;
          if (challenge.attempts >= MAX_OTP_ATTEMPTS) {
            challenge.consumedAt = now;
            challenge.consumedReason = ConsumedReason.AttemptsExhausted;
          }
          await em.save(challenge);
          // The failed attempt must persist, so respond after commit.
          return null;
        }

        const user = await em.findOne(User, {
          where: { id: challenge.userId },
          lock: { mode: 'pessimistic_write' },
        });
        challenge.consumedAt = now;
        if (!user || user.status !== UserStatus.Pending) {
          challenge.consumedReason = ConsumedReason.UserInactive;
          await em.save(challenge);
          return null;
        }
        challenge.consumedReason = ConsumedReason.Confirmed;
        user.status = UserStatus.Active;
        await em.save([challenge, user]);
        // TODO(phase 2): assign the `user` role here.
        return { id: user.id, email: user.email, status: user.status };
      })
      .then((result) => {
        if (!result) throw AppException.badRequest(INVALID_CODE_MESSAGE);
        return result;
      });
  }

  async resend(email: string): Promise<ConfirmationRequired> {
    const user = await this.dataSource
      .getRepository(User)
      .findOne({ where: { email } });

    // Neutral answer for unknown / already active emails.
    if (!user || user.status !== UserStatus.Pending) {
      return this.confirmationResponse(randomUUID());
    }

    const issued = await this.dataSource.transaction(async (em) => {
      const last = await em.findOne(RegistrationChallenge, {
        where: { userId: user.id },
        order: { createdAt: 'DESC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        last &&
        Date.now() - last.lastSentAt.getTime() < RESEND_COOLDOWN_SECONDS * 1000
      ) {
        throw AppException.rateLimitExceeded('Resend is allowed once a minute');
      }
      if (last && !last.consumedAt) {
        last.consumedAt = new Date();
        last.consumedReason = ConsumedReason.Replaced;
        await em.save(last);
      }
      return this.issueChallenge(em, user.id);
    });

    await this.deliver(email, issued.attemptId, issued.secret);
    return this.confirmationResponse(issued.attemptId);
  }

  private async issueChallenge(em: EntityManager, userId: string) {
    const method = this.method;
    const attemptId = randomUUID();
    const secret =
      method === ChallengeMethod.Otp
        ? this.crypto.generateOtp()
        : this.crypto.generateMagicSecret();
    const now = new Date();
    await em.insert(RegistrationChallenge, {
      id: attemptId,
      userId,
      method,
      secretHash: this.crypto.hash(attemptId, secret),
      attempts: 0,
      lastSentAt: now,
      expiresAt: new Date(now.getTime() + CHALLENGE_TTL_SECONDS * 1000),
    });
    return { attemptId, secret };
  }

  /** The user and challenge are already committed; a failure here -> 503. */
  private async deliver(to: string, attemptId: string, secret: string) {
    try {
      if (this.method === ChallengeMethod.Otp) {
        await this.email.sendRegistrationConfirmation({ to, code: secret });
      } else {
        const base = this.config.get('MAGIC_LINK_BASE_URL') ?? '';
        const token = encodeURIComponent(`${attemptId}.${secret}`);
        await this.email.sendRegistrationConfirmation({
          to,
          link: `${base}?token=${token}`,
        });
      }
    } catch (err) {
      this.logger.error(
        `Failed to send registration email: ${(err as Error).message}`,
      );
      throw AppException.serviceUnavailable(
        'Could not send confirmation email',
      );
    }
  }

  private confirmationResponse(attemptId: string): ConfirmationRequired {
    return {
      confirmationRequired: true,
      method: this.method,
      attemptId,
      expiresInSeconds: CHALLENGE_TTL_SECONDS,
      resendAfterSeconds: RESEND_COOLDOWN_SECONDS,
    };
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
