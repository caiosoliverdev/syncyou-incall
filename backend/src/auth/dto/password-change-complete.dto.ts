import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PasswordChangeCompleteDto {
  @ApiProperty({ description: 'JWT devolvido após verificar OTP (password_change_via_otp)' })
  @IsString()
  @MinLength(10)
  changeToken!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  newPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  confirmPassword!: string;
}
