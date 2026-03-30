import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  @ApiPropertyOptional({ description: 'Texto (mensagem simples ou legenda)' })
  @IsOptional()
  @IsString()
  @MaxLength(16000)
  text?: string;

  @ApiPropertyOptional({ default: 'text' })
  @IsOptional()
  @IsString()
  @MaxLength(24)
  kind?: string;

  @ApiPropertyOptional({ description: 'replyTo, attachment, forwardOf (JSON)' })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
