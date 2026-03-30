import { BeforeInsert, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

@Entity('call_logs')
@Index(['conversationId'])
@Index(['status'])
@Index(['createdAt'])
export class CallLog {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  callType!: 'direct' | 'group';

  @Column('uuid')
  conversationId!: string;

  @Column('uuid')
  initiatedByUserId!: string;

  @Column({ type: 'varchar', length: 16 })
  status!: 'ringing' | 'ongoing' | 'missed' | 'completed';

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  participantUserIds!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  joinedUserIds!: string[];

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  activeUserIds!: string[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  answeredAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  missedAt!: Date | null;

  @Column({ type: 'integer', nullable: true })
  durationSeconds!: number | null;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
