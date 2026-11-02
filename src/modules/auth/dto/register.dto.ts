import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

const normalizeEmail = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

export class RegisterDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @Length(8, 128)
  @Matches(/\p{L}/u, { message: 'password must contain a letter' })
  @Matches(/\p{N}/u, { message: 'password must contain a digit' })
  password: string;
}

export class ResendDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(320)
  email: string;
}

/** Either `token` (magic link) or `attemptId` + `code` (OTP). */
export class ConfirmRegistrationDto {
  @ValidateIf((o: ConfirmRegistrationDto) => !o.attemptId && !o.code)
  @IsString()
  @Length(1, 256)
  token?: string;

  @ValidateIf((o: ConfirmRegistrationDto) => !o.token)
  @IsUUID()
  attemptId?: string;

  @ValidateIf((o: ConfirmRegistrationDto) => !o.token)
  @Matches(/^\d{6}$/)
  code?: string;
}
