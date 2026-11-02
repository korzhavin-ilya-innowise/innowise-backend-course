/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument */
import { ConfigService } from '@/core/config/config.service';
import { AppException } from '@/core/errors/app.exception';
import { User, UserStatus } from '@/modules/users/user.entity';

import { ChallengeCryptoService } from './challenge-crypto.service';
import { ChallengeMethod, ConsumedReason } from './challenge.types';
import { EmailService } from './email/email.service';
import { PasswordService } from './password.service';
import { RegistrationChallenge } from './registration-challenge.entity';
import { RegistrationService } from './registration.service';

function setup(env: Record<string, string> = {}) {
  const store = {
    users: [] as User[],
    challenges: [] as RegistrationChallenge[],
  };
  const em = {
    create: (_c: unknown, v: object) => ({ ...v }),
    save: (x: any) => {
      const arr = Array.isArray(x) ? x : [x];
      for (const e of arr) {
        if ('passwordHash' in e && !store.users.includes(e)) {
          e.id ??= `u${store.users.length + 1}`;
          store.users.push(e);
        }
      }
      return Promise.resolve(x);
    },
    insert: (_c: unknown, v: RegistrationChallenge) => {
      store.challenges.push({
        consumedAt: null,
        consumedReason: null,
        createdAt: new Date(),
        ...v,
      } as RegistrationChallenge);
      return Promise.resolve();
    },
    findOne: (cls: unknown, o: any) => {
      if (cls === User)
        return Promise.resolve(store.users.find((u) => u.id === o.where.id));
      const list = store.challenges.filter((c) =>
        o.where.id ? c.id === o.where.id : c.userId === o.where.userId,
      );
      return Promise.resolve(list[list.length - 1]);
    },
  };
  const dataSource = {
    transaction: (fn: (e: typeof em) => unknown) => fn(em),
    getRepository: () => ({
      exists: ({ where }: any) =>
        Promise.resolve(store.users.some((u) => u.email === where.email)),
      findOne: ({ where }: any) =>
        Promise.resolve(store.users.find((u) => u.email === where.email)),
    }),
  };
  const values: Record<string, string> = {
    LOGIN_CHALLENGE_HMAC_KEY: 'k'.repeat(32),
    REGISTRATION_EMAIL_CONFIRMATION_ENABLED: 'false',
    ...env,
  };
  const config = { get: (k: string) => values[k] } as unknown as ConfigService;
  const sent: { code?: string; link?: string }[] = [];
  const email = {
    sendRegistrationConfirmation: jest.fn((m) => {
      sent.push(m);
      return Promise.resolve();
    }),
  } as unknown as EmailService;
  const passwords = {
    hash: () => Promise.resolve('hash'),
  } as unknown as PasswordService;
  const svc = new RegistrationService(
    dataSource as any,
    config,
    new ChallengeCryptoService(config),
    passwords,
    email,
  );
  return { svc, store, sent, email };
}

const ON = { REGISTRATION_EMAIL_CONFIRMATION_ENABLED: 'true' };

describe('RegistrationService', () => {
  it('registers active user without confirmation', async () => {
    const { svc } = setup();
    const r = await svc.register('a@b.co', 'pw');
    expect(r).toMatchObject({ email: 'a@b.co', status: UserStatus.Active });
    expect(r).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email with 409', async () => {
    const { svc } = setup();
    await svc.register('a@b.co', 'pw');
    await expect(svc.register('a@b.co', 'pw')).rejects.toMatchObject({
      code: 'conflict',
    });
  });

  it('creates pending user + OTP challenge and never returns the secret', async () => {
    const { svc, store, sent } = setup(ON);
    const r = await svc.register('a@b.co', 'pw');
    expect(r).toMatchObject({
      confirmationRequired: true,
      method: ChallengeMethod.Otp,
      expiresInSeconds: 600,
      resendAfterSeconds: 60,
    });
    expect(store.users[0].status).toBe(UserStatus.Pending);
    expect(JSON.stringify(r)).not.toContain(sent[0].code!);
    expect(store.challenges[0].secretHash).not.toContain(sent[0].code!);
  });

  it('confirms with the right code', async () => {
    const { svc, store, sent } = setup(ON);
    const r: any = await svc.register('a@b.co', 'pw');
    const out = await svc.confirm({
      attemptId: r.attemptId,
      code: sent[0].code,
    });
    expect(out.status).toBe(UserStatus.Active);
    expect(store.challenges[0].consumedReason).toBe(ConsumedReason.Confirmed);
    // second use is a generic 400
    await expect(
      svc.confirm({ attemptId: r.attemptId, code: sent[0].code }),
    ).rejects.toMatchObject({ code: 'bad_request' });
  });

  it('burns the attempt after 5 wrong codes, then 429 even for the right one', async () => {
    const { svc, sent } = setup(ON);
    const r: any = await svc.register('a@b.co', 'pw');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      await expect(
        svc.confirm({ attemptId: r.attemptId, code: wrong }),
      ).rejects.toMatchObject({ code: 'bad_request' });
    }
    await expect(
      svc.confirm({ attemptId: r.attemptId, code: sent[0].code }),
    ).rejects.toMatchObject({ code: 'rate_limit_exceeded' });
  });

  it('5th attempt may still succeed', async () => {
    const { svc, sent } = setup(ON);
    const r: any = await svc.register('a@b.co', 'pw');
    const wrong = sent[0].code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++)
      await expect(
        svc.confirm({ attemptId: r.attemptId, code: wrong }),
      ).rejects.toBeInstanceOf(AppException);
    await expect(
      svc.confirm({ attemptId: r.attemptId, code: sent[0].code }),
    ).resolves.toMatchObject({ status: UserStatus.Active });
  });

  it('expired challenge -> 400 without counting an attempt', async () => {
    const { svc, store, sent } = setup(ON);
    const r: any = await svc.register('a@b.co', 'pw');
    store.challenges[0].expiresAt = new Date(Date.now() - 1000);
    await expect(
      svc.confirm({ attemptId: r.attemptId, code: sent[0].code }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(store.challenges[0].attempts).toBe(0);
  });

  it('resend: 429 within 60s, replaces challenge after', async () => {
    const { svc, store, sent } = setup(ON);
    await svc.register('a@b.co', 'pw');
    await expect(svc.resend('a@b.co')).rejects.toMatchObject({
      code: 'rate_limit_exceeded',
    });
    store.challenges[0].lastSentAt = new Date(Date.now() - 61_000);
    const r = await svc.resend('a@b.co');
    expect(store.challenges).toHaveLength(2);
    expect(store.challenges[0].consumedReason).toBe(ConsumedReason.Replaced);
    expect(sent).toHaveLength(2);
    await expect(
      svc.confirm({ attemptId: store.challenges[0].id, code: sent[0].code }),
    ).rejects.toMatchObject({ code: 'bad_request' });
    expect(r.attemptId).toBe(store.challenges[1].id);
  });

  it('resend for unknown email is neutral', async () => {
    const { svc, sent } = setup(ON);
    await expect(svc.resend('x@y.co')).resolves.toMatchObject({
      confirmationRequired: true,
    });
    expect(sent).toHaveLength(0);
  });

  it('magic link flow uses attemptId.secret token', async () => {
    const { svc, sent } = setup({
      ...ON,
      REGISTRATION_CONFIRMATION_METHOD: 'magic_link',
      MAGIC_LINK_BASE_URL: 'http://x/c',
    });
    await svc.register('a@b.co', 'pw');
    const token = decodeURIComponent(sent[0].link!.split('token=')[1]);
    await expect(svc.confirm({ token })).resolves.toMatchObject({
      status: UserStatus.Active,
    });
    await expect(svc.confirm({ token })).rejects.toMatchObject({
      code: 'bad_request',
    });
    await expect(svc.confirm({ token: 'garbage' })).rejects.toMatchObject({
      code: 'bad_request',
    });
  });

  it('SMTP failure -> 503 and pending user is kept', async () => {
    const { svc, store, email } = setup(ON);
    (email.sendRegistrationConfirmation as jest.Mock).mockRejectedValueOnce(
      new Error('smtp down'),
    );
    await expect(svc.register('a@b.co', 'pw')).rejects.toMatchObject({
      code: 'service_unavailable',
    });
    expect(store.users[0].status).toBe(UserStatus.Pending);
    expect(store.challenges).toHaveLength(1);
  });
});
