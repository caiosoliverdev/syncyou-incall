import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LinkPreviewService } from './link-preview.service';

@ApiTags('link-preview')
@Controller('link-preview')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class LinkPreviewController {
  constructor(private readonly linkPreview: LinkPreviewService) {}

  @Get()
  @ApiOperation({ summary: 'Metadados Open Graph / HTML para preview de links (evita CORS no cliente)' })
  async getPreview(@Query('url') url: string | undefined) {
    if (!url) {
      return null;
    }
    return this.linkPreview.preview(url);
  }
}
