import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LegalDocument } from './entities/legal-document.entity';
import { LegalDocumentKind } from './enums/legal-document-kind.enum';
import type {
  LegalBundleResponseDto,
  LegalDocumentPublicDto,
} from './dto/legal-document-public.dto';

@Injectable()
export class LegalService {
  constructor(
    @InjectRepository(LegalDocument)
    private readonly repo: Repository<LegalDocument>,
  ) {}

  private map(doc: LegalDocument): LegalDocumentPublicDto {
    return {
      kind: doc.kind as 'terms' | 'privacy',
      title: doc.title,
      content: doc.content,
      versionLabel: doc.versionLabel,
      publishedAt: doc.publishedAt.toISOString(),
    };
  }

  async getCurrentBundle(): Promise<LegalBundleResponseDto> {
    const terms = await this.findLatest(LegalDocumentKind.TERMS);
    const privacy = await this.findLatest(LegalDocumentKind.PRIVACY);
    if (!terms || !privacy) {
      throw new ServiceUnavailableException(
        'Documentos legais ainda não configurados',
      );
    }
    return {
      terms: this.map(terms),
      privacy: this.map(privacy),
    };
  }

  private async findLatest(
    kind: LegalDocumentKind,
  ): Promise<LegalDocument | null> {
    return this.repo.findOne({
      where: { kind, deleted: false },
      order: { publishedAt: 'DESC' },
    });
  }
}
