import { IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class UpdateGroupDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  description?: string;
}

export class AddGroupMembersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  memberUserIds!: string[];
}

export class SetGroupMemberRoleDto {
  /** `moderator` — promover membro; `member` — remover função de moderador. */
  @IsIn(['moderator', 'member'])
  role!: 'moderator' | 'member';
}
