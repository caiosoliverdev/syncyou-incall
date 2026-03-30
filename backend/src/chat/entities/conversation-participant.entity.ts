import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

@Entity('conversation_participants')
@Unique(['conversationId', 'userId'])
@Index(['userId'])
export class ConversationParticipant {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  conversationId!: string;

  @Column('uuid')
  userId!: string;

  /**
   * Apagar conversa para mim: mensagens anteriores deixam de ser listadas;
   * a mesma conversa directa reutiliza-se ao voltar a falar com a pessoa.
   */
  @Column({ type: 'timestamptz', nullable: true })
  clearedHistoryAt!: Date | null;

  /**
   * Última mensagem (criada até este instante) considerada lida por este participante.
   * Contagem de não lidas: mensagens do par com createdAt > lastReadAt.
   */
  @Column({ type: 'timestamptz', nullable: true })
  lastReadAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  favorite!: boolean;

  @Column({ type: 'boolean', default: false })
  muted!: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  joinedAt!: Date;

  /**
   * Apenas conversas em grupo: `admin`, `moderator` ou `member`.
   * Conversa directa: sempre null.
   */
  @Column({ type: 'varchar', length: 16, nullable: true })
  groupRole!: 'admin' | 'moderator' | 'member' | null;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
