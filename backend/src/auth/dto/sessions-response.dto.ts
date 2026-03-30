import { ApiProperty } from '@nestjs/swagger';

export class SessionListItemDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  createdAt!: string;

  @ApiProperty()
  expiresAt!: string;

  /** Refresh ainda válido (não expirado). */
  @ApiProperty()
  active!: boolean;

  /** Mesmo `sid` que o access token deste pedido (esta app / separador). */
  @ApiProperty()
  current!: boolean;

  @ApiProperty()
  ip!: string;

  @ApiProperty({ nullable: true })
  city!: string | null;

  @ApiProperty()
  loginMethod!: string;

  @ApiProperty({ nullable: true })
  userAgent!: string | null;
}

export class SessionsResponseDto {
  @ApiProperty({
    type: [SessionListItemDto],
    description:
      'Sessões com ligação Socket.IO activa (apenas dispositivos/abas online).',
  })
  sessions!: SessionListItemDto[];
}
