import { ApiProperty } from '@nestjs/swagger';

export class RegisterResponseDto {
  @ApiProperty()
  message!: string;

  @ApiProperty({
    description:
      'false se o SMTP falhou (ex.: dev sem servidor de mail); a conta foi criada na mesma.',
  })
  emailSent!: boolean;
}
