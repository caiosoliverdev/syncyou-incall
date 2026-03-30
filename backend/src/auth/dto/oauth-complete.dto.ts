import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class OAuthCompleteDto {
  @ApiProperty({ description: 'JWT emitido no callback OAuth (typ oauth_signup)' })
  @IsString()
  @MinLength(10)
  signupToken!: string;

  @ApiPropertyOptional({
    description:
      'Chave pública para E2E (ex.: base64). Mensagens devem ser cifradas no cliente.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(8000)
  encryptionPublicKey?: string;

  @ApiPropertyOptional({
    description: 'IP público do cliente quando o servidor só vê loopback em dev.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(45)
  @Matches(/^[\d.a-fA-F:]+$/)
  clientPublicIp?: string;
}
