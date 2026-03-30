import { ApiProperty } from '@nestjs/swagger';

export class LegalDocumentPublicDto {
  @ApiProperty({ enum: ['terms', 'privacy'] })
  kind!: 'terms' | 'privacy';

  @ApiProperty()
  title!: string;

  @ApiProperty({ description: 'Texto completo; parágrafos separados por linha dupla' })
  content!: string;

  @ApiProperty({ example: '2026-03' })
  versionLabel!: string;

  @ApiProperty()
  publishedAt!: string;
}

export class LegalBundleResponseDto {
  @ApiProperty({ type: LegalDocumentPublicDto })
  terms!: LegalDocumentPublicDto;

  @ApiProperty({ type: LegalDocumentPublicDto })
  privacy!: LegalDocumentPublicDto;
}
