import { Controller, Get } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { LegalBundleResponseDto } from './dto/legal-document-public.dto';
import { LegalService } from './legal.service';

@ApiTags('legal')
@Controller('legal')
@SkipThrottle()
export class LegalController {
  constructor(private readonly legalService: LegalService) {}

  @Get()
  @ApiOperation({
    summary: 'Termos e política atuais (cadastro / modais no app)',
  })
  @ApiOkResponse({ type: LegalBundleResponseDto })
  getCurrent(): Promise<LegalBundleResponseDto> {
    return this.legalService.getCurrentBundle();
  }
}
