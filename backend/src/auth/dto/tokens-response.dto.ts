import { ApiProperty } from '@nestjs/swagger';
import { AuthUserResponseDto } from './auth-user-response.dto';

export class TokensResponseDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty({ description: 'Token opaco; guardar com segurança' })
  refreshToken!: string;

  @ApiProperty({ example: 900 })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserResponseDto })
  user!: AuthUserResponseDto;
}
