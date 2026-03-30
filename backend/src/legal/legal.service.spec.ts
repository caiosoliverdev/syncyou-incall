import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LegalService } from './legal.service';
import { LegalDocument } from './entities/legal-document.entity';
import { LegalDocumentKind } from './enums/legal-document-kind.enum';

describe('LegalService', () => {
  let service: LegalService;
  const mockRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LegalService,
        {
          provide: getRepositoryToken(LegalDocument),
          useValue: mockRepo,
        },
      ],
    }).compile();
    service = module.get(LegalService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('getCurrentBundle returns both documents', async () => {
    const base = {
      deleted: false,
      versionLabel: '2026-03',
      publishedAt: new Date('2026-03-01'),
      title: 'T',
      content: 'a',
    };
    mockRepo.findOne
      .mockResolvedValueOnce({ ...base, kind: LegalDocumentKind.TERMS })
      .mockResolvedValueOnce({ ...base, kind: LegalDocumentKind.PRIVACY });

    const bundle = await service.getCurrentBundle();
    expect(bundle.terms.kind).toBe('terms');
    expect(bundle.privacy.kind).toBe('privacy');
  });
});
