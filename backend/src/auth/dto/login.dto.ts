import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  password!: string;

  /** Se `true`, reativa conta desativada e devolve tokens (credenciais já validadas). */
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  reactivate?: boolean;

  /** Opcional: geolocalização do cliente (após permissão no browser). */
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

  /**
   * IP público do cliente (ex. api.ipify.org) quando o servidor só vê loopback (::1)
   * em desenvolvimento ou atrás de proxy local.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Matches(/^[\d.a-fA-F:]+$/)
  clientPublicIp?: string;
}
