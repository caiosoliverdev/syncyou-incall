import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';

export const PRESENCE_STATUSES = ['online', 'away', 'busy', 'invisible', 'on_call'] as const;
export type PresenceStatus = (typeof PRESENCE_STATUSES)[number];

export class UpdatePresenceDto {
  @ApiProperty({ enum: PRESENCE_STATUSES, description: 'Estado de presença' })
  @IsIn([...PRESENCE_STATUSES])
  status!: PresenceStatus;
}
