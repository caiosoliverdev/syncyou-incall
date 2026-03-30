import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class DeactivateAccountDto {
  @ApiPropertyOptional({
    description: 'Obrigatória se a conta tiver senha',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;
}
