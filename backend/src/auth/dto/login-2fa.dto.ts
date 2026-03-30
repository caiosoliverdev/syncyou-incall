import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class Login2faDto {
  @ApiProperty({ description: 'JWT devolvido quando TWO_FACTOR_REQUIRED' })
  @IsString()
  @MinLength(10)
  tempToken!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 6)
  totpCode!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  latitude?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  longitude?: number;

  @ApiPropertyOptional({
    description:
      'IP público do cliente (ex. ipify) quando o servidor só vê ::1 / rede privada.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Matches(/^[\d.a-fA-F:]+$/)
  clientPublicIp?: string;
}
