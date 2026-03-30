import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Digite exatamente EXCLUIR para confirmar',
    example: 'EXCLUIR',
  })
  @IsString()
  @IsIn(['EXCLUIR'])
  confirmation!: 'EXCLUIR';

  @ApiPropertyOptional({
    description: 'Obrigatória se a conta tiver senha',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  password?: string;
}
