import { ArrayMinSize, IsArray, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateGroupDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** Amigos a adicionar (UUID, ex. v7); pelo menos um. O criador entra automaticamente. */
  @IsArray()
  @ArrayMinSize(1)
  /** UUID v4-only falha com IDs v7 usados na app — aceitar qualquer variante válida. */
  @IsUUID('all', { each: true })
  memberUserIds!: string[];
}
