import { ConfigService } from '@/core/config/config.service';

import { ChallengeCryptoService } from './challenge-crypto.service';

const svc = new ChallengeCryptoService({
  get: () => 'k'.repeat(32),
} as unknown as ConfigService);

describe('ChallengeCryptoService', () => {
  it('generates 6-digit OTPs', () => {
    for (let i = 0; i < 50; i++) expect(svc.generateOtp()).toMatch(/^\d{6}$/);
  });
  it('generates distinct magic secrets', () => {
    expect(svc.generateMagicSecret()).not.toBe(svc.generateMagicSecret());
  });
  it('verifies only the matching secret and attempt id', () => {
    const h = svc.hash('a1', '123456');
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(svc.verify('a1', '123456', h)).toBe(true);
    expect(svc.verify('a1', '123457', h)).toBe(false);
    expect(svc.verify('a2', '123456', h)).toBe(false);
  });
});
