import { Expose, Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { IsApplicationPassword } from './password.validation';
export class ChangePasswordDto {
  @Expose() @Transform(({ value, obj }: { value: unknown; obj: { current_password?: unknown } }) => value ?? obj.current_password) @IsString() currentPassword!: string;
  @Expose() @Transform(({ value, obj }: { value: unknown; obj: { new_password?: unknown } }) => value ?? obj.new_password) @IsApplicationPassword() newPassword!: string;
  @IsOptional() @IsString() current_password?: string;
  @IsOptional() @IsApplicationPassword() new_password?: string;
}
export class RequestPasswordResetDto { @IsEmail() email!: string; }
export class ResetPasswordDto {
  @IsString() @MinLength(20) token!: string;
  @Expose() @Transform(({ value, obj }: { value: unknown; obj: { new_password?: unknown } }) => value ?? obj.new_password) @IsApplicationPassword() newPassword!: string;
  @IsOptional() @IsApplicationPassword() new_password?: string;
}
