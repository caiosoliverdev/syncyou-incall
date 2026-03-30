import { BeforeInsert, Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

@Entity('conversations')
export class Conversation {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16, default: 'direct' })
  type!: 'direct' | 'group';

  /**
   * Apenas para `type = group`.
   * - `channel`: grupo normal / sala persistente.
   * - `call`: conversa criada por uma ligação em grupo temporária.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  groupSubtype!: 'channel' | 'call' | null;

  /** Grupo: nome visível. Direct: não usado. */
  @Column({ type: 'varchar', length: 256, nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Caminho relativo em `data/uploads` (ex. group-avatars/xxx.jpg). */
  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarPath!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
