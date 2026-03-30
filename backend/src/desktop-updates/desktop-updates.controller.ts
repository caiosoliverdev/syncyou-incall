import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { diskStorage } from 'multer';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { PublishDesktopUpdateDto } from './dto/publish-desktop-update.dto';
import { DesktopUpdatesPublishGuard } from './guards/desktop-updates-publish.guard';
import { DesktopUpdatesService } from './desktop-updates.service';

@ApiTags('desktop-updates')
@Controller('desktop-updates')
export class DesktopUpdatesController {
  constructor(private readonly desktopUpdates: DesktopUpdatesService) {}

  @Get('latest.json')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
  @Header('Pragma', 'no-cache')
  @ApiOperation({
    summary: 'Manifest Tauri updater (JSON dinâmico a partir da base de dados)',
  })
  getLatestJson() {
    return this.desktopUpdates.getLatestUpdaterManifest();
  }

  @Post('publish')
  @SkipThrottle()
  @UseGuards(DesktopUpdatesPublishGuard)
  @ApiSecurity('desktop-updates-publish')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Enviar bundle + assinatura (.sig) para uma plataforma' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['platform', 'appVersion', 'bundle', 'signature'],
      properties: {
        platform: {
          type: 'string',
          enum: [
            'darwin-aarch64',
            'darwin-x86_64',
            'linux-x86_64',
            'linux-aarch64',
            'windows-x86_64',
          ],
        },
        appVersion: { type: 'string', example: '0.0.3' },
        notes: { type: 'string' },
        bundle: { type: 'string', format: 'binary' },
        signature: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'bundle', maxCount: 1 },
        { name: 'signature', maxCount: 1 },
      ],
      {
        storage: diskStorage({
          destination: (_req, _file, cb) => {
            const dir = join(process.cwd(), 'data', 'desktop-updates', '.upload-tmp');
            mkdirSync(dir, { recursive: true });
            cb(null, dir);
          },
          filename: (_req, file, cb) => {
            cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${file.fieldname}`);
          },
        }),
        limits: { fileSize: 800 * 1024 * 1024 },
      },
    ),
  )
  publish(
    @Body() dto: PublishDesktopUpdateDto,
    @UploadedFiles()
    files: { bundle?: Express.Multer.File[]; signature?: Express.Multer.File[] },
  ) {
    const bundle = files.bundle?.[0];
    const signature = files.signature?.[0];
    if (!bundle?.path) {
      throw new BadRequestException('Ficheiro multipart "bundle" é obrigatório');
    }
    if (!signature?.path) {
      throw new BadRequestException('Ficheiro multipart "signature" é obrigatório');
    }
    return this.desktopUpdates.publishFromMulterFiles(
      dto,
      bundle.path,
      signature.path,
      bundle.originalname,
    );
  }
}
