import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { SoftDeletableEntity } from '../../common/entities/soft-deletable.entity';
import { LegalDocumentKind } from '../enums/legal-document-kind.enum';

@Entity('legal_documents')
@Index(['kind', 'publishedAt'])
export class LegalDocument extends SoftDeletableEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  kind!: LegalDocumentKind;

  @Column({ type: 'varchar', length: 200 })
  title!: string;

  /** Parágrafos em texto simples; separar com linha dupla (\n\n) no cliente. */
  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'varchar', length: 64 })
  versionLabel!: string;

  @Column({ type: 'timestamptz' })
  publishedAt!: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  setId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
