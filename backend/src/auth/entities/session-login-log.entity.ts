import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { User } from '../../users/entities/user.entity';
import { RefreshToken } from './refresh-token.entity';

/** Registo de cada novo início de sessão (login), ligado ao refresh token criado. */
@Entity('session_login_logs')
@Index(['userId', 'createdAt'])
export class SessionLoginLog {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: User;

  @Column({ type: 'varchar', length: 64 })
  ip!: string;

  @Column({ type: 'varchar', length: 256, nullable: true })
  city!: string | null;

  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ type: 'text', nullable: true })
  userAgent!: string | null;

  /** Ex.: password, totp_2fa, oauth_google, oauth_microsoft, oauth_reactivate, oauth_register */
  @Column({ type: 'varchar', length: 32 })
  loginMethod!: string;

  @ManyToOne(() => RefreshToken, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'refreshTokenId' })
  refreshToken!: RefreshToken | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
