import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  DEFAULT_PRIVACY_CONTENT,
  DEFAULT_TERMS_CONTENT,
} from './data/default-legal-content';
import { LegalDocument } from './entities/legal-document.entity';
import { LegalDocumentKind } from './enums/legal-document-kind.enum';

@Injectable()
export class LegalSeedService implements OnModuleInit {
  private readonly logger = new Logger(LegalSeedService.name);

  constructor(
    @InjectRepository(LegalDocument)
    private readonly repo: Repository<LegalDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedIfEmpty();
  }

  private async seedIfEmpty(): Promise<void> {
    const count = await this.repo.count({ where: { deleted: false } });
    if (count > 0) {
      return;
    }

    const now = new Date();
    const version = now.toISOString().slice(0, 7);

    const terms = this.repo.create({
      kind: LegalDocumentKind.TERMS,
      title: 'Termos de Uso',
      content: DEFAULT_TERMS_CONTENT,
      versionLabel: version,
      publishedAt: now,
      deleted: false,
      deletedAt: null,
    });
    const privacy = this.repo.create({
      kind: LegalDocumentKind.PRIVACY,
      title: 'Politica de Privacidade',
      content: DEFAULT_PRIVACY_CONTENT,
      versionLabel: version,
      publishedAt: now,
      deleted: false,
      deletedAt: null,
    });

    await this.repo.save([terms, privacy]);
    this.logger.log('Documentos legais iniciais criados (terms + privacy).');
  }
}
