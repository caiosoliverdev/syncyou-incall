import { BadRequestException, Injectable } from '@nestjs/common';
import { getLinkPreview } from 'link-preview-js';

@Injectable()
export class LinkPreviewService {
  private isAllowedHttpUrl(url: string): boolean {
    try {
      const u = new URL(url);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      const host = u.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.local') ||
        host.startsWith('192.168.') ||
        host.startsWith('10.')
      ) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  async preview(rawUrl: string): Promise<unknown | null> {
    const trimmed = rawUrl.trim();
    if (!trimmed || trimmed.length > 2048) {
      throw new BadRequestException('URL inválida.');
    }
    const normalized = /^https?:\/\//i.test(trimmed)
      ? trimmed
      : `https://${trimmed}`;
    if (!this.isAllowedHttpUrl(normalized)) {
      return null;
    }
    try {
      return await getLinkPreview(normalized, {
        timeout: 12_000,
        headers: {
          'user-agent':
            'Mozilla/5.0 (compatible; SyncYou/1.0; +https://syncyou.app) link-preview',
        },
      });
    } catch {
      return null;
    }
  }
}
