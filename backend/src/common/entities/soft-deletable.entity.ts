import { Column, UpdateDateColumn } from 'typeorm';

/** Nada é apagado fisicamente: `deleted === true` marca remoção lógica. */
export abstract class SoftDeletableEntity {
  @Column({ type: 'boolean', default: false })
  deleted!: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
