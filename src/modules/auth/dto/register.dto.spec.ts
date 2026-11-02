import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ConfirmRegistrationDto, RegisterDto } from './register.dto';

const check = (email: string, password: string) =>
  validate(plainToInstance(RegisterDto, { email, password }));

describe('RegisterDto', () => {
  it('normalizes email', async () => {
    const dto = plainToInstance(RegisterDto, {
      email: '  User@Example.COM ',
      password: 'abcdefg1',
    });
    expect(dto.email).toBe('user@example.com');
    expect(await validate(dto)).toHaveLength(0);
  });

  it.each([
    ['short', 'abc123'],
    ['no digit', 'abcdefghi'],
    ['no letter', '123456789'],
    ['too long', 'a1'.repeat(65)],
  ])('rejects password: %s', async (_n, pw) => {
    expect((await check('a@b.co', pw)).length).toBeGreaterThan(0);
  });

  it('accepts 128 chars and non-latin letters', async () => {
    expect(await check('a@b.co', 'a1'.repeat(64))).toHaveLength(0);
    expect(await check('a@b.co', 'пароль123')).toHaveLength(0);
  });

  it('rejects invalid email', async () => {
    expect((await check('nope', 'abcdefg1')).length).toBeGreaterThan(0);
  });
});

describe('ConfirmRegistrationDto', () => {
  const v = (o: object) => validate(plainToInstance(ConfirmRegistrationDto, o));
  it('accepts token or attemptId+code', async () => {
    expect(await v({ token: 'x.y' })).toHaveLength(0);
    expect(
      await v({
        attemptId: '3f2b8c1e-5d4a-4b6e-9c7d-1a2b3c4d5e6f',
        code: '123456',
      }),
    ).toHaveLength(0);
  });
  it('rejects empty and malformed', async () => {
    expect((await v({})).length).toBeGreaterThan(0);
    expect((await v({ attemptId: 'x', code: '12' })).length).toBeGreaterThan(0);
  });
});
