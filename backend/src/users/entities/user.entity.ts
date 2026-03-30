import { BeforeInsert, Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import { randomBytes } from 'crypto';
import { SoftDeletableEntity } from '../../common/entities/soft-deletable.entity';

@Entity('users')
/** Email único entre contas ativas; linhas eliminadas (`deleted`) libertam o email para novo registo. */
@Index('UQ_users_email_active', ['email'], {
  unique: true,
  where: '"deleted" = false',
})
@Index(['publicToken'], { unique: true })
export class User extends SoftDeletableEntity {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 120 })
  firstName!: string;

  @Column({ type: 'varchar', length: 120 })
  lastName!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  /** Null para contas só OAuth (Google / Microsoft). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  /** `local` = email+senha; `google` | `microsoft` = último início OAuth (pode coexistir com senha após definir). */
  @Column({ type: 'varchar', length: 32, default: 'local' })
  authProvider!: string;

  /** ID único no provedor OAuth (sub / id Microsoft). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  oauthSubject!: string | null;

  /** Caminho relativo servido em `/api/v1/files/...` ou null. */
  @Column({ type: 'varchar', length: 512, nullable: true })
  avatarUrl!: string | null;

  /**
   * Identificador opaco único por utilizador (API / correlacão E2E).
   * Não confundir com JWT de sessão.
   */
  @Column({ type: 'varchar', length: 64 })
  publicToken!: string;

  /**
   * Chave pública para criptografia de mensagens (ex.: X25519/Ed25519 em base64).
   * O conteúdo das conversações não deve ser legível no servidor.
   */
  @Column({ type: 'text', nullable: true })
  encryptionPublicKey!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  emailVerificationToken!: string | null;

  /** WhatsApp (E.164 ou texto livre); preenchido só após login. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  phoneWhatsapp!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  socialDiscord!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  socialLinkedin!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  socialYoutube!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  socialInstagram!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  socialFacebook!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  websiteUrl!: string | null;

  /** Conta temporariamente inativa (não pode usar a app até reativar). */
  @Column({ type: 'timestamptz', nullable: true })
  accountDisabledAt!: Date | null;

  /** Secret TOTP (Base32) quando 2FA está ativo. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  totpSecret!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  twoFactorEnabledAt!: Date | null;

  /** Durante o fluxo de ativação 2FA, antes de confirmar o primeiro TOTP. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  pendingTotpSecret!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  lastSessionIp!: string | null;

  @Column({ type: 'varchar', length: 256, nullable: true })
  lastSessionCity!: string | null;

  @Column({ type: 'double precision', nullable: true })
  lastSessionLatitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  lastSessionLongitude!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSessionAt!: Date | null;

  /** Estado de presença mostrado na app (online, ausente, ocupado, invisível). */
  @Column({ type: 'varchar', length: 16, default: 'online' })
  presenceStatus!: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  setDefaults(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
    if (!this.publicToken) {
      this.publicToken = randomBytes(32).toString('hex');
    }
  }
}
