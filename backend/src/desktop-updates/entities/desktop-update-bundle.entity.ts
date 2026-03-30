import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('desktop_update_bundles')
@Unique(['platform', 'appVersion'])
export class DesktopUpdateBundle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Chave Tauri updater: darwin-aarch64, windows-x86_64, linux-x86_64, etc. */
  @Column({ type: 'varchar', length: 64 })
  platform: string;

  @Column({ name: 'app_version', type: 'varchar', length: 64 })
  appVersion: string;

  /** Caminho relativo dentro de `data/desktop-updates/bundles/`. */
  @Column({ name: 'storage_relative_path', type: 'varchar', length: 512 })
  storageRelativePath: string;

  @Column({ name: 'original_filename', type: 'varchar', length: 255 })
  originalFilename: string;

  @Column({ type: 'text' })
  signature: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
