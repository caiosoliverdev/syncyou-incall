import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const DESKTOP_UPDATE_PLATFORMS = [
  'darwin-aarch64',
  'darwin-x86_64',
  'linux-x86_64',
  'linux-aarch64',
  'windows-x86_64',
] as const;

export type DesktopUpdatePlatform = (typeof DESKTOP_UPDATE_PLATFORMS)[number];

export class PublishDesktopUpdateDto {
  @IsString()
  @IsIn([...DESKTOP_UPDATE_PLATFORMS])
  platform: DesktopUpdatePlatform;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  appVersion: string;

  @IsOptional()
  @IsString()
  @MaxLength(16_000)
  notes?: string;
}
