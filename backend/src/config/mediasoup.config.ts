import { registerAs } from '@nestjs/config';

/**
 * SFU Mediasoup: ver https://mediasoup.org/documentation/v3/mediasoup/api/
 * Activado por defeito; desligar com MEDIASOUP_ENABLED=false.
 * Em produção: definir MEDIASOUP_ANNOUNCED_IP (IP público ou hostname) para ICE atrás de NAT.
 */
export default registerAs('mediasoup', () => ({
  enabled: process.env.MEDIASOUP_ENABLED !== 'false',
  /** Intervalo UDP RTC (firewall / security groups). */
  rtcMinPort: Number.parseInt(process.env.MEDIASOUP_RTC_MIN_PORT ?? '40000', 10),
  rtcMaxPort: Number.parseInt(process.env.MEDIASOUP_RTC_MAX_PORT ?? '49999', 10),
  /** IP anunciado nos candidatos ICE do worker (obrigatório atrás de NAT em prod). */
  announcedIp: process.env.MEDIASOUP_ANNOUNCED_IP?.trim() || undefined,
  logLevel: process.env.MEDIASOUP_LOG_LEVEL ?? 'warn',
}));
