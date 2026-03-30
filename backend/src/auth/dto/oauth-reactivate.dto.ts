import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class OAuthReactivateDto {
  @ApiProperty({ description: 'JWT emitido no fluxo OAuth quando a conta está desativada.' })
  @IsString()
  @MinLength(10)
  reactivationToken!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Matches(/^[\d.a-fA-F:]+$/)
  clientPublicIp?: string;
}
