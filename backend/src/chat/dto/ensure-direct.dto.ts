import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class EnsureDirectDto {
  @ApiProperty({ description: 'ID do utilizador amigo' })
  @IsUUID()
  peerUserId!: string;
}
