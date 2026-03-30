import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  lastName?: string;

  @ApiPropertyOptional({ description: 'Telefone / WhatsApp' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phoneWhatsapp?: string;

  @ApiPropertyOptional({ description: 'Discord (utilizador ou link)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  socialDiscord?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  socialLinkedin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  socialYoutube?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  socialInstagram?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(512)
  socialFacebook?: string;

  @ApiPropertyOptional({ description: 'Site pessoal ou profissional' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  websiteUrl?: string;
}
