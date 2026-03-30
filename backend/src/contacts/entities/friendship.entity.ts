import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

export type FriendshipStatus = 'pending' | 'accepted' | 'blocked';

@Entity('friendships')
@Unique(['requesterId', 'addresseeId'])
@Index(['addresseeId', 'status'])
@Index(['requesterId', 'status'])
export class Friendship {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  requesterId!: string;

  @Column('uuid')
  addresseeId!: string;

  @Column({ type: 'varchar', length: 24 })
  status!: FriendshipStatus;

  /** Quem iniciou o bloqueio quando `status` === blocked. */
  @Column({ type: 'uuid', nullable: true })
  blockedByUserId!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
