import { Injectable } from '@nestjs/common';
import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

import { ConfigService } from '@/core/config/config.service';

@Injectable()
export class ChallengeCryptoService {
  constructor(private readonly config: ConfigService) {}

  /** 6-digit OTP from a CSPRNG. */
  generateOtp(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  /** 32 random bytes, base64url. */
  generateMagicSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  /** HMAC-SHA256 hex bound to the attempt id, so a hash is not portable. */
  hash(attemptId: string, secret: string): string {
    return createHmac('sha256', this.config.get('LOGIN_CHALLENGE_HMAC_KEY'))
      .update(`${attemptId}.${secret}`)
      .digest('hex');
  }

  verify(attemptId: string, secret: string, expectedHash: string): boolean {
    const actual = Buffer.from(this.hash(attemptId, secret), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
