import { BeforeInsert, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

@Entity('messages')
@Index(['conversationId', 'createdAt'])
export class Message {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  conversationId!: string;

  @Column('uuid')
  senderId!: string;

  @Column({ type: 'varchar', length: 24 })
  kind!: string;

  @Column({ type: 'text', nullable: true })
  text!: string | null;

  /** replyTo, attachment, forwardOf, etc. */
  @Column({ type: 'jsonb', nullable: true })
  payload!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  /** Apagar para todos: o remetente deixa de ver a mensagem; o outro vê placeholder. */
  @Column({ type: 'timestamptz', nullable: true })
  deletedForEveryoneAt!: Date | null;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
