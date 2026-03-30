import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class TwoFactorDisableDto {
  @ApiPropertyOptional({ description: 'Obrigatório se a conta tiver senha local' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;
}
