import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class InviteByEmailDto {
  @ApiProperty({ example: 'amigo@exemplo.com' })
  @IsNotEmpty()
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
