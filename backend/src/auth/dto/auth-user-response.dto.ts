import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AuthUserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiPropertyOptional()
  avatarUrl!: string | null;

  @ApiProperty({ description: 'Token público único do utilizador' })
  publicToken!: string;

  @ApiProperty()
  emailVerified!: boolean;

  @ApiPropertyOptional({
    description: 'Chave pública E2E (se registada)',
  })
  encryptionPublicKey!: string | null;

  @ApiPropertyOptional()
  phoneWhatsapp!: string | null;

  @ApiPropertyOptional()
  socialDiscord!: string | null;

  @ApiPropertyOptional()
  socialLinkedin!: string | null;

  @ApiPropertyOptional()
  socialYoutube!: string | null;

  @ApiPropertyOptional()
  socialInstagram!: string | null;

  @ApiPropertyOptional()
  socialFacebook!: string | null;

  @ApiPropertyOptional()
  websiteUrl!: string | null;

  @ApiPropertyOptional({
    description: 'Se definida, a conta está desativada',
  })
  accountDisabledAt!: string | null;

  @ApiProperty({
    description: 'Se a conta tem senha local (para pedir senha ao desativar/eliminar)',
  })
  hasPassword!: boolean;

  @ApiProperty({ description: 'Autenticação de dois fatores (TOTP) ativa' })
  twoFactorEnabled!: boolean;

  @ApiPropertyOptional({ description: 'Última sessão conhecida (IP)' })
  lastSessionIp!: string | null;

  @ApiPropertyOptional()
  lastSessionCity!: string | null;

  @ApiPropertyOptional()
  lastSessionLatitude!: number | null;

  @ApiPropertyOptional()
  lastSessionLongitude!: number | null;

  @ApiPropertyOptional()
  lastSessionAt!: string | null;

  @ApiProperty({
    enum: ['online', 'away', 'busy', 'invisible', 'on_call'],
    description: 'Estado de presença (persistido)',
  })
  presenceStatus!: 'online' | 'away' | 'busy' | 'invisible' | 'on_call';
}
