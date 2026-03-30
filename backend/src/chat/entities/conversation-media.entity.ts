import {
  BeforeInsert,
  Column,
  Entity,
  Index,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

/**
 * Índice de anexos por conversa (foto, vídeo, áudio, documento).
 * Sincronizado ao enviar mensagem e removido ao apagar para todos / apagar grupo.
 */
@Entity('conversation_media')
@Index(['conversationId', 'sentAt'])
@Unique('UQ_conversation_media_messageId', ['messageId'])
export class ConversationMedia {
  @PrimaryColumn('uuid')
  id!: string;

  @Column('uuid')
  conversationId!: string;

  @Column('uuid')
  messageId!: string;

  @Column('uuid')
  senderId!: string;

  @Column({ type: 'varchar', length: 16 })
  category!: 'image' | 'video' | 'document' | 'audio';

  /** Caminho relativo em `data/uploads` (ex. chat/{convId}/...). */
  @Column({ type: 'varchar', length: 512 })
  storagePath!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  posterPath!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  fileName!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  mimeType!: string | null;

  @Column({ type: 'timestamptz' })
  sentAt!: Date;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
