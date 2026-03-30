import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshDto {
  @ApiProperty({ description: 'Refresh token opaco devolvido no login.' })
  @IsString()
  @MinLength(32)
  refreshToken!: string;
}
