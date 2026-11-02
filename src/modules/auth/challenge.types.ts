export enum ChallengeMethod {
  Otp = 'otp',
  MagicLink = 'magic_link',
}

export enum ConsumedReason {
  Confirmed = 'confirmed',
  Replaced = 'replaced',
  AttemptsExhausted = 'attempts_exhausted',
  UserInactive = 'user_inactive',
}

export const CHALLENGE_TTL_SECONDS = 600;
export const RESEND_COOLDOWN_SECONDS = 60;
export const MAX_OTP_ATTEMPTS = 5;
