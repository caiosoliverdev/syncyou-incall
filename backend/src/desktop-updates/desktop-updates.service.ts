import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, createWriteStream, promises as fs } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Repository } from 'typeorm';
import { maxSatisfying, valid as semverValid } from 'semver';
import { DesktopUpdateBundle } from './entities/desktop-update-bundle.entity';
import type { PublishDesktopUpdateDto } from './dto/publish-desktop-update.dto';

const BUNDLES_DIR = 'bundles';

@Injectable()
export class DesktopUpdatesService {
  private readonly logger = new Logger(DesktopUpdatesService.name);

  constructor(
    @InjectRepository(DesktopUpdateBundle)
    private readonly bundles: Repository<DesktopUpdateBundle>,
    private readonly config: ConfigService,
  ) {}

  private desktopUpdatesRoot(): string {
    return join(process.cwd(), 'data', 'desktop-updates');
  }

  private bundlesRoot(): string {
    return join(this.desktopUpdatesRoot(), BUNDLES_DIR);
  }

  private sanitizeFilename(name: string): string {
    const base = name.replace(/\\/g, '/').split('/').pop() ?? 'bundle';
    if (base.includes('..') || base.length === 0) {
      throw new BadRequestException('Nome de arquivo inválido');
    }
    return base.slice(0, 240);
  }

  async publishFromMulterFiles(
    dto: PublishDesktopUpdateDto,
    bundleTmpPath: string,
    signatureTmpPath: string,
    originalFilename: string | undefined,
  ): Promise<DesktopUpdateBundle> {
    const signature = (await fs.readFile(signatureTmpPath, 'utf8')).trim();
    await fs.unlink(signatureTmpPath).catch(() => undefined);
    try {
      const stream = createReadStream(bundleTmpPath);
      return await this.saveStreamUpload({
        dto,
        bundleStream: stream,
        originalFilename,
        signature,
      });
    } finally {
      await fs.unlink(bundleTmpPath).catch(() => undefined);
    }
  }

  private async saveStreamUpload(params: {
    dto: PublishDesktopUpdateDto;
    bundleStream: NodeJS.ReadableStream;
    originalFilename: string | undefined;
    signature: string;
  }): Promise<DesktopUpdateBundle> {
    const { dto, bundleStream, originalFilename, signature } = params;
    if (!signature?.trim()) {
      throw new BadRequestException('Assinatura obrigatória');
    }

    const version = dto.appVersion.trim();
    if (!semverValid(version)) {
      throw new BadRequestException(`Versão semver inválida: ${version}`);
    }

    const safeName = this.sanitizeFilename(originalFilename ?? 'bundle');
    const relPath = join(version, dto.platform, safeName).replace(/\\/g, '/');

    const dir = join(this.bundlesRoot(), version, dto.platform);
    await fs.mkdir(dir, { recursive: true });

    const destAbs = join(this.bundlesRoot(), relPath);

    const existing = await this.bundles.findOne({
      where: { platform: dto.platform, appVersion: version },
    });
    if (existing) {
      const oldAbs = join(this.bundlesRoot(), existing.storageRelativePath);
      await fs.unlink(oldAbs).catch(() => undefined);
      await this.bundles.remove(existing);
    }

    await pipeline(bundleStream, createWriteStream(destAbs));

    const entity = this.bundles.create({
      platform: dto.platform,
      appVersion: version,
      storageRelativePath: relPath,
      originalFilename: safeName,
      signature: signature.trim(),
      notes: dto.notes?.trim() ? dto.notes.trim() : null,
    });
    const saved = await this.bundles.save(entity);
    this.logger.log(`Publicado ${dto.platform} @ ${version} → ${relPath}`);
    return saved;
  }

  async getLatestUpdaterManifest(): Promise<{
    version: string;
    notes: string;
    pub_date: string;
    platforms: Record<string, { signature: string; url: string }>;
  }> {
    const rows = await this.bundles.find({ order: { createdAt: 'DESC' } });
    if (rows.length === 0) {
      throw new NotFoundException('Nenhum pacote de atualização publicado');
    }

    const distinct = [...new Set(rows.map((r) => r.appVersion))];
    const validVersions = distinct.filter((v) => semverValid(v)) as string[];
    const maxV = maxSatisfying(validVersions, '*', { includePrerelease: true });
    if (!maxV) {
      throw new NotFoundException('Nenhuma versão semver válida encontrada');
    }

    const atVersion = rows.filter((r) => r.appVersion === maxV);
    const base = this.config.get<string>('desktopUpdates.apiPublicBaseUrl', '').replace(/\/$/, '');
    if (!base) {
      throw new InternalServerErrorException('API_PUBLIC_BASE_URL não configurada');
    }

    const platforms: Record<string, { signature: string; url: string }> = {};
    let latestCreated = 0;
    let notes = '';

    for (const r of atVersion) {
      const pathEncoded = r.storageRelativePath
        .split('/')
        .map((seg) => encodeURIComponent(seg))
        .join('/');
      platforms[r.platform] = {
        signature: r.signature,
        url: `${base}/api/v1/desktop-updates/files/${pathEncoded}`,
      };
      const t = r.createdAt.getTime();
      if (t > latestCreated) {
        latestCreated = t;
      }
      if (!notes && r.notes) {
        notes = r.notes;
      }
    }

    return {
      version: maxV,
      notes,
      pub_date: new Date(latestCreated || Date.now()).toISOString(),
      platforms,
    };
  }
}
