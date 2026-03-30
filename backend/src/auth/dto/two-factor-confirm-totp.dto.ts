import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class TwoFactorConfirmTotpDto {
  @ApiProperty({ example: '123456', description: 'Código de 6 dígitos da app autenticadora' })
  @IsString()
  @Length(6, 6)
  @Matches(/^\d{6}$/)
  code!: string;
}
