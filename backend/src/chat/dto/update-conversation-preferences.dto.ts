import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateConversationPreferencesDto {
  @IsOptional()
  @IsBoolean()
  favorite?: boolean;

  @IsOptional()
  @IsBoolean()
  muted?: boolean;
}
