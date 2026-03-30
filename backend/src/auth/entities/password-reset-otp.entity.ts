import { BeforeInsert, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { SoftDeletableEntity } from '../../common/entities/soft-deletable.entity';

@Entity('password_reset_otps')
@Index(['email', 'consumedAt'])
export class PasswordResetOtp extends SoftDeletableEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  /** Ex.: forgot_password, password_change, two_factor_enable */
  @Column({ type: 'varchar', length: 32, default: 'forgot_password' })
  purpose!: string;

  @Column({ type: 'varchar', length: 255 })
  codeHash!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
