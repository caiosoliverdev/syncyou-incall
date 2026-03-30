import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mediasoup from 'mediasoup';
import type {
  Router,
  RouterRtpCodecCapability,
  TransportListenIp,
  WebRtcTransportOptions,
  Worker,
  WorkerLogLevel,
} from 'mediasoup/types';

const MEDIA_CODECS: RouterRtpCodecCapability[] = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

const LOG_LEVELS: WorkerLogLevel[] = ['debug', 'warn', 'error', 'none'];

function parseWorkerLogLevel(raw: string | undefined): WorkerLogLevel {
  if (raw && LOG_LEVELS.includes(raw as WorkerLogLevel)) {
    return raw as WorkerLogLevel;
  }
  return 'warn';
}

/**
 * SFU: um worker e um {@link Router} por sala (ex.: conversationId de chamada directa).
 * Próximos passos: WebRtcTransport, Producer/Consumer e sinalização via Socket.IO.
 */
@Injectable()
export class MediasoupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MediasoupService.name);
  private worker: Worker | null = null;
  /** roomId (ex.: conversationId) → router */
  private readonly routers = new Map<string, Router>();

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<boolean>('mediasoup.enabled', { infer: true }) === true;
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.log('Mediasoup desligado (MEDIASOUP_ENABLED=false).');
      return;
    }
    const rtcMinPort = this.config.get<number>('mediasoup.rtcMinPort', {
      infer: true,
    })!;
    const rtcMaxPort = this.config.get<number>('mediasoup.rtcMaxPort', {
      infer: true,
    })!;
    const announcedIp = this.config.get<string | undefined>('mediasoup.announcedIp', {
      infer: true,
    });
    const logLevel = parseWorkerLogLevel(
      this.config.get<string>('mediasoup.logLevel', { infer: true }),
    );
    try {
      this.worker = await mediasoup.createWorker({
        logLevel,
        rtcMinPort,
        rtcMaxPort,
      });
      this.worker.on('died', () => {
        this.logger.error('Mediasoup worker morreu; reinicie o processo.');
      });
      this.logger.log(
        `Mediasoup worker iniciado (UDP ${rtcMinPort}-${rtcMaxPort}` +
          (announcedIp ? `, announcedIp=${announcedIp}` : ', announcedIp=não definido') +
          ').',
      );
    } catch (e) {
      this.logger.error(`Falha ao iniciar Mediasoup: ${String(e)}`);
      this.worker = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    for (const [, router] of this.routers) {
      router.close();
    }
    this.routers.clear();
    this.worker?.close();
    this.worker = null;
  }

  getWorker(): Worker | null {
    return this.worker;
  }

  /** Preferência de rede para WebRtcTransport (browser ↔ SFU). */
  getWebRtcTransportOptions(): WebRtcTransportOptions {
    const announcedIp = this.config.get<string | undefined>('mediasoup.announcedIp', {
      infer: true,
    });
    const listenIps: TransportListenIp[] = announcedIp
      ? [{ ip: '0.0.0.0', announcedIp }]
      : [{ ip: '127.0.0.1' }];
    return {
      listenIps,
      enableUdp: true,
      enableTcp: true,
    };
  }

  async getOrCreateRouter(roomId: string): Promise<Router | null> {
    if (!this.worker) {
      return null;
    }
    let router = this.routers.get(roomId);
    if (!router) {
      router = await this.worker.createRouter({ mediaCodecs: MEDIA_CODECS });
      this.routers.set(roomId, router);
      router.observer.on('close', () => {
        this.routers.delete(roomId);
      });
    }
    return router;
  }

  getRouter(roomId: string): Router | undefined {
    return this.routers.get(roomId);
  }

  async closeRoom(roomId: string): Promise<void> {
    const router = this.routers.get(roomId);
    if (router) {
      router.close();
      this.routers.delete(roomId);
    }
  }

  rtpCapabilitiesOfRouter(router: Router) {
    return router.rtpCapabilities;
  }
}
