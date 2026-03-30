import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  forwardRef,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { createHash, createHmac, randomBytes, randomInt } from 'crypto';
import { mkdirSync, existsSync } from 'fs';
import { unlink, writeFile } from 'fs/promises';
import { join } from 'path';
import * as QRCode from 'qrcode';
import { generateSecret, generateURI, verifySync } from 'otplib';
import { In, IsNull, Repository } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import type { SignOptions } from 'jsonwebtoken';
import type { OauthConfigSlice } from '../config/oauth.config';
import type { JwtConfigSlice } from './jwt-config.types';
import { PasswordResetOtp } from './entities/password-reset-otp.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { SessionLoginLog } from './entities/session-login-log.entity';
import type { OAuthCompleteDto } from './dto/oauth-complete.dto';
import type { RegisterResponseDto } from './dto/register-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ReactivateAccountDto } from './dto/reactivate-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import type { PresenceStatus } from './dto/update-presence.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import type { PasswordChangeCompleteDto } from './dto/password-change-complete.dto';
import type { PasswordChangeVerifyDto } from './dto/password-change-verify.dto';
import type { Login2faDto } from './dto/login-2fa.dto';
import type { TwoFactorVerifyEmailDto } from './dto/two-factor-verify-email.dto';
import type { TwoFactorConfirmTotpDto } from './dto/two-factor-confirm-totp.dto';
import type { TwoFactorDisableDto } from './dto/two-factor-disable.dto';
import {
  OTP_PURPOSE_FORGOT_PASSWORD,
  OTP_PURPOSE_PASSWORD_CHANGE,
  OTP_PURPOSE_TWO_FACTOR_ENABLE,
} from './otp-purpose';
import type { AuthUserResponseDto } from './dto/auth-user-response.dto';
import type { TokensResponseDto } from './dto/tokens-response.dto';
import type { SessionsResponseDto } from './dto/sessions-response.dto';
import { ContactsService } from '../contacts/contacts.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { OAuthBridgeService } from './oauth-bridge/oauth-bridge.service';
import { SessionRegistryService } from './session/session-registry.service';
import type { OAuthProfilePayload } from './types/oauth-profile.types';

const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: MailerService,
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
    @InjectRepository(PasswordResetOtp)
    private readonly otpRepo: Repository<PasswordResetOtp>,
    @InjectRepository(SessionLoginLog)
    private readonly sessionLogRepo: Repository<SessionLoginLog>,
    private readonly oauthBridge: OAuthBridgeService,
    private readonly sessionRegistry: SessionRegistryService,
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
  ) {}

  private get jwtCfg(): JwtConfigSlice {
    return this.config.getOrThrow<JwtConfigSlice>('jwt');
  }

  private get appBaseUrl(): string {
    return this.config.getOrThrow<{ baseUrl: string }>('app').baseUrl;
  }

  private get oauthCfg(): OauthConfigSlice {
    return this.config.getOrThrow<OauthConfigSlice>('oauth');
  }

  private hashRefresh(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }

  private hashOtp(code: string): string {
    const pepper = this.config.getOrThrow<{ otpPepper: string }>('security')
      .otpPepper;
    return createHmac('sha256', pepper).update(code).digest('hex');
  }

  private toUserResponse(user: User): AuthUserResponseDto {
    const base = this.appBaseUrl.replace(/\/$/, '');
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl ? `${base}/api/v1/files/${user.avatarUrl}` : null,
      publicToken: user.publicToken,
      emailVerified: !!user.emailVerifiedAt,
      encryptionPublicKey: user.encryptionPublicKey,
      phoneWhatsapp: user.phoneWhatsapp ?? null,
      socialDiscord: user.socialDiscord ?? null,
      socialLinkedin: user.socialLinkedin ?? null,
      socialYoutube: user.socialYoutube ?? null,
      socialInstagram: user.socialInstagram ?? null,
      socialFacebook: user.socialFacebook ?? null,
      websiteUrl: user.websiteUrl ?? null,
      accountDisabledAt: user.accountDisabledAt
        ? user.accountDisabledAt.toISOString()
        : null,
      hasPassword: user.passwordHash != null,
      twoFactorEnabled: !!user.twoFactorEnabledAt && !!user.totpSecret,
      lastSessionIp: user.lastSessionIp ?? null,
      lastSessionCity: user.lastSessionCity ?? null,
      lastSessionLatitude: user.lastSessionLatitude ?? null,
      lastSessionLongitude: user.lastSessionLongitude ?? null,
      lastSessionAt: user.lastSessionAt ? user.lastSessionAt.toISOString() : null,
      presenceStatus: this.normalizePresenceStatus(user.presenceStatus),
    };
  }

  private normalizePresenceStatus(
    raw: string | undefined | null,
  ): 'online' | 'away' | 'busy' | 'invisible' | 'on_call' {
    const ok = ['online', 'away', 'busy', 'invisible', 'on_call'] as const;
    if (raw && ok.includes(raw as (typeof ok)[number])) {
      return raw as (typeof ok)[number];
    }
    return 'online';
  }

  private getClientIp(req?: Request): string {
    if (!req) {
      return 'unknown';
    }
    const xf = req.headers['x-forwarded-for'];
    if (typeof xf === 'string' && xf.trim()) {
      return xf.split(',')[0].trim();
    }
    const addr = req.socket?.remoteAddress ?? req.ip;
    return typeof addr === 'string' && addr ? addr : 'unknown';
  }

  /** Em dev/local o socket costuma ser ::1; aí aceitamos IP público reportado pelo cliente (ex. ipify). */
  private isLoopbackOrPrivateOrUnknown(ip: string): boolean {
    const t = ip.trim().toLowerCase();
    if (t === 'unknown' || t === '') return true;
    if (t === '::1' || t === '127.0.0.1') return true;
    if (t.startsWith('::ffff:127.')) return true;
    if (t.startsWith('192.168.')) return true;
    if (t.startsWith('10.')) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(t)) return true;
    if (t.startsWith('fe80:')) return true;
    if (/^f[cd][0-9a-f]/i.test(t)) return true;
    return false;
  }

  private looksLikeValidIpString(s: string): boolean {
    const t = s.trim();
    if (t.length < 3 || t.length > 45) return false;
    return /^[\d.a-fA-F:]+$/.test(t);
  }

  /** IP efetivo para sessão: direto do pedido, ou IP público do cliente quando o direto é só loopback/privado. */
  private resolveSessionIp(
    req: Request | undefined,
    clientReportedPublicIp?: string | null,
  ): string {
    const direct = this.getClientIp(req);
    const r = clientReportedPublicIp?.trim();
    if (
      r &&
      this.looksLikeValidIpString(r) &&
      this.isLoopbackOrPrivateOrUnknown(direct)
    ) {
      return r;
    }
    return direct;
  }

  private async reverseGeocodeCity(lat: number, lng: number): Promise<string | null> {
    try {
      const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lng)}&localityLanguage=pt`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        return null;
      }
      const j = (await res.json()) as {
        locality?: string;
        city?: string;
        principalSubdivision?: string;
        countryName?: string;
      };
      const locality = j.locality?.trim();
      const city = j.city?.trim();
      const subdivision = j.principalSubdivision?.trim();
      const country = j.countryName?.trim();
      const place =
        locality ||
        city ||
        (subdivision && country ? `${subdivision}, ${country}` : subdivision || country || null);
      return place ?? null;
    } catch {
      return null;
    }
  }

  private async persistSessionMetadata(
    user: User,
    ctx: { ip: string; latitude?: number; longitude?: number },
  ): Promise<User> {
    user.lastSessionIp = ctx.ip;
    user.lastSessionAt = new Date();
    const lat = ctx.latitude;
    const lng = ctx.longitude;
    if (
      lat != null &&
      lng != null &&
      Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
    ) {
      user.lastSessionLatitude = lat;
      user.lastSessionLongitude = lng;
      user.lastSessionCity = await this.reverseGeocodeCity(lat, lng);
    }
    await this.usersService.save(user);
    const fresh = await this.usersService.findActiveById(user.id);
    return fresh ?? user;
  }

  private async sign2faTempToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { typ: '2fa_challenge', sub: userId },
      { expiresIn: '5m' },
    );
  }

  private refreshExpiryDate(): Date {
    const raw = this.jwtCfg.refreshExpiresIn;
    const out = new Date();
    const m = /^(\d+)(m|h|d)$/.exec(raw.trim());
    if (!m) {
      out.setDate(out.getDate() + 7);
      return out;
    }
    const n = parseInt(m[1], 10);
    if (m[2] === 'm') {
      out.setMinutes(out.getMinutes() + n);
    } else if (m[2] === 'h') {
      out.setHours(out.getHours() + n);
    } else if (m[2] === 'd') {
      out.setDate(out.getDate() + n);
    }
    return out;
  }

  private accessExpiresSeconds(): number {
    const raw = this.jwtCfg.accessExpiresIn;
    const m = /^(\d+)(m|h|d)$/.exec(raw.trim());
    if (!m) return 900;
    const n = parseInt(m[1], 10);
    if (m[2] === 'm') return n * 60;
    if (m[2] === 'h') return n * 3600;
    if (m[2] === 'd') return n * 86400;
    return 900;
  }

  async register(
    dto: RegisterDto,
    photo: Express.Multer.File | undefined,
  ): Promise<RegisterResponseDto> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('Senhas não coincidem');
    }

    const email = dto.email.toLowerCase().trim();
    const existing = await this.usersService.findActiveByEmail(email);
    if (existing) {
      throw new ConflictException('Email já registado');
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });
    const debugSkip = this.config.get<boolean>('auth.debugSkipEmailVerification');
    const emailVerificationToken = debugSkip
      ? null
      : randomBytes(32).toString('hex');

    const user = this.usersService.createPartial({
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      email,
      passwordHash,
      encryptionPublicKey: dto.encryptionPublicKey?.trim() ?? null,
      emailVerifiedAt: debugSkip ? new Date() : null,
      emailVerificationToken,
      avatarUrl: null,
    });

    const saved = await this.usersService.save(user);

    if (photo?.buffer?.length) {
      const dir = join(process.cwd(), 'data', 'uploads', 'avatars');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const relative = `avatars/${saved.id}.jpg`;
      const full = join(process.cwd(), 'data', 'uploads', relative);
      await writeFile(full, photo.buffer);
      saved.avatarUrl = relative;
      await this.usersService.save(saved);
    }

    if (debugSkip) {
      this.logger.log(
        'Registo: conta ativa sem confirmação por email (AUTH_DEBUG_SKIP_EMAIL_VERIFICATION).',
      );
      return {
        message:
          'Conta criada e ativa (modo debug). Pode iniciar sessão imediatamente.',
        emailSent: false,
      };
    }

    const confirmUrl = `${this.appBaseUrl.replace(/\/$/, '')}/api/v1/auth/confirm-email?token=${emailVerificationToken}`;

    let emailSent = true;
    try {
      await this.mailer.sendMail({
        to: email,
        subject: 'Confirme o seu email — SyncYou',
        template: 'confirm-email',
        context: {
          name: saved.firstName,
          confirmUrl,
        },
      });
    } catch (err) {
      emailSent = false;
      this.logger.warn(
        `Registo: email de confirmação não enviado (${err instanceof Error ? err.message : String(err)}). Conta criada na mesma.`,
      );
      this.logger.warn(`Link de confirmação (copiar manualmente em dev): ${confirmUrl}`);
    }

    return {
      message: emailSent
        ? 'Conta criada. Verifique o email para ativar (link expira em 24 horas).'
        : 'Conta criada, mas o email de confirmação não pôde ser enviado (verifique SMTP ou use o link enviado pelo administrador). Pode tentar reenviar mais tarde.',
      emailSent,
    };
  }

  async login(dto: LoginDto, req?: Request): Promise<TokensResponseDto> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findAnyByEmail(email);
    if (!user) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: 'Não existe conta com este email.',
        code: 'USER_NOT_FOUND',
        email,
      });
    }

    if (user.deleted) {
      if (user.passwordHash != null) {
        const pwOk = await argon2.verify(user.passwordHash, dto.password);
        if (!pwOk) {
          throw new UnauthorizedException('Credenciais inválidas');
        }
      }
      throw new ForbiddenException({
        statusCode: 403,
        message:
          'Esta conta foi eliminada. Pode criar uma nova conta com o mesmo email.',
        code: 'ACCOUNT_DELETED',
        email: user.email,
      });
    }

    if (user.passwordHash == null) {
      throw new UnauthorizedException({
        statusCode: 401,
        message:
          'Esta conta usa início de sessão com Google ou Microsoft. Utilize um desses métodos.',
        code: 'OAUTH_ONLY',
        email: user.email,
      });
    }

    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException(
        'Conta ainda não ativada. Confirme o email enviado no registo.',
      );
    }

    if (user.accountDisabledAt) {
      if (dto.reactivate) {
        user.accountDisabledAt = null;
        await this.usersService.save(user);
      } else {
        throw new ForbiddenException({
          statusCode: 403,
          message:
            'Conta desativada. Confirme se deseja reativar para continuar.',
          code: 'ACCOUNT_DISABLED',
        });
      }
    }

    if (user.totpSecret && user.twoFactorEnabledAt) {
      const tempToken = await this.sign2faTempToken(user.id);
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Introduza o código da aplicação de autenticação.',
        code: 'TWO_FACTOR_REQUIRED',
        tempToken,
      });
    }

    return this.issueTokens(user, {
      req,
      latitude: dto.latitude,
      longitude: dto.longitude,
      loginMethod: 'password',
    });
  }

  async completeLogin2fa(
    dto: Login2faDto,
    req?: Request,
  ): Promise<TokensResponseDto> {
    let payload: { typ?: string; sub?: string };
    try {
      payload = await this.jwtService.verifyAsync<{ typ?: string; sub?: string }>(
        dto.tempToken,
      );
    } catch {
      throw new BadRequestException('Sessão de verificação expirada ou inválida.');
    }
    if (payload.typ !== '2fa_challenge' || !payload.sub) {
      throw new BadRequestException('Token inválido.');
    }
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user?.totpSecret || !user.twoFactorEnabledAt) {
      throw new BadRequestException('2FA não está ativo para esta conta.');
    }
    const result = verifySync({
      secret: user.totpSecret,
      token: dto.totpCode,
    });
    if (!result.valid) {
      throw new BadRequestException('Código de autenticação incorreto.');
    }
    return this.issueTokens(user, {
      req,
      latitude: dto.latitude,
      longitude: dto.longitude,
      loginMethod: 'totp_2fa',
      clientPublicIp: dto.clientPublicIp,
    });
  }

  async oauthReactivateWithToken(
    reactivationToken: string,
    req?: Request,
    clientPublicIp?: string,
  ): Promise<TokensResponseDto> {
    let payload: { typ?: string; sub?: string };
    try {
      payload = await this.jwtService.verifyAsync<{
        typ?: string;
        sub?: string;
      }>(reactivationToken);
    } catch {
      throw new BadRequestException(
        'Token de reativação inválido ou expirado.',
      );
    }
    if (payload.typ !== 'oauth_reactivate' || !payload.sub) {
      throw new BadRequestException('Token de reativação inválido.');
    }
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user || !user.accountDisabledAt) {
      throw new BadRequestException(
        'Conta não está desativada ou já foi reativada.',
      );
    }
    user.accountDisabledAt = null;
    await this.usersService.save(user);
    return this.issueTokens(user, {
      req,
      loginMethod: 'oauth_reactivate',
      clientPublicIp,
    });
  }

  private async signOAuthReactivateToken(userId: string): Promise<string> {
    return this.jwtService.signAsync(
      { typ: 'oauth_reactivate', sub: userId },
      { expiresIn: '15m' },
    );
  }

  private async issueTokens(
    user: User,
    session?: {
      req?: Request;
      latitude?: number;
      longitude?: number;
      loginMethod: string;
      clientPublicIp?: string;
    },
  ): Promise<TokensResponseDto> {
    let u = user;
    if (session) {
      const ip = this.resolveSessionIp(session.req, session.clientPublicIp);
      u = await this.persistSessionMetadata(user, {
        ip,
        latitude: session.latitude,
        longitude: session.longitude,
      });
    }

    const rawRefresh = randomBytes(48).toString('base64url');
    const tokenHash = this.hashRefresh(rawRefresh);
    const expiresAt = this.refreshExpiryDate();

    const rt = this.refreshRepo.create({
      userId: u.id,
      tokenHash,
      expiresAt,
      deleted: false,
      deletedAt: null,
    });
    await this.refreshRepo.save(rt);

    const accessToken = await this.jwtService.signAsync({
      sub: u.id,
      typ: 'access',
      sid: rt.id,
    });

    if (session) {
      const ip = this.resolveSessionIp(session.req, session.clientPublicIp);
      const uaRaw = session.req?.headers['user-agent'];
      const uaStr =
        typeof uaRaw === 'string'
          ? uaRaw
          : Array.isArray(uaRaw)
            ? uaRaw[0]
            : undefined;
      const ua = uaStr ? uaStr.slice(0, 2000) : null;
      const log = this.sessionLogRepo.create({
        userId: u.id,
        ip,
        city: u.lastSessionCity,
        latitude: u.lastSessionLatitude,
        longitude: u.lastSessionLongitude,
        userAgent: ua,
        loginMethod: session.loginMethod,
        refreshToken: rt,
      });
      await this.sessionLogRepo.save(log);
      this.logger.log(
        `Sessão: user=${u.id} method=${session.loginMethod} ip=${ip} refresh=${rt.id}`,
      );
    }

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn: this.accessExpiresSeconds(),
      user: this.toUserResponse(u),
    };
  }

  async refresh(dto: RefreshDto): Promise<TokensResponseDto> {
    const hash = this.hashRefresh(dto.refreshToken);
    const row = await this.refreshRepo.findOne({
      where: { tokenHash: hash, deleted: false },
      relations: ['user'],
    });

    if (!row || row.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token inválido ou expirado');
    }

    const user = await this.usersService.findActiveById(row.userId);
    if (!user || !user.emailVerifiedAt) {
      throw new UnauthorizedException('Utilizador inválido');
    }

    if (user.accountDisabledAt) {
      throw new ForbiddenException('Conta desativada');
    }

    row.deleted = true;
    row.deletedAt = new Date();
    await this.refreshRepo.save(row);

    return this.issueTokens(user);
  }

  async me(userId: string): Promise<AuthUserResponseDto> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.toUserResponse(user);
  }

  async listSessions(
    userId: string,
    currentSessionId?: string,
  ): Promise<SessionsResponseDto> {
    const activeIds = this.sessionRegistry.getActiveSessionIds(userId);
    if (activeIds.length === 0) {
      return { sessions: [] };
    }

    const tokens = await this.refreshRepo.find({
      where: { userId, deleted: false, id: In(activeIds) },
      order: { createdAt: 'DESC' },
    });

    const now = new Date();
    const logByRtId = new Map<string, SessionLoginLog>();

    if (tokens.length > 0) {
      const ids = tokens.map((t) => t.id);
      const logs = await this.sessionLogRepo.find({
        where: { userId, refreshToken: { id: In(ids) } },
        relations: ['refreshToken'],
      });
      for (const log of logs) {
        const rid = log.refreshToken?.id;
        if (rid && !logByRtId.has(rid)) {
          logByRtId.set(rid, log);
        }
      }
    }

    const sessions = tokens.map((rt) => {
      const log = logByRtId.get(rt.id);
      return {
        id: rt.id,
        createdAt: rt.createdAt.toISOString(),
        expiresAt: rt.expiresAt.toISOString(),
        active: rt.expiresAt > now,
        current: currentSessionId === rt.id,
        ip: log?.ip ?? '—',
        city: log?.city ?? null,
        loginMethod: log?.loginMethod ?? 'unknown',
        userAgent: log?.userAgent ?? null,
      };
    });

    return { sessions };
  }

  async revokeSession(
    userId: string,
    sessionId: string,
    currentSessionId?: string,
  ): Promise<{ wasCurrent: boolean }> {
    const rt = await this.refreshRepo.findOne({
      where: { id: sessionId, userId, deleted: false },
    });
    if (!rt) {
      throw new NotFoundException('Sessão não encontrada');
    }
    rt.deleted = true;
    rt.deletedAt = new Date();
    await this.refreshRepo.save(rt);
    this.sessionRegistry.notifySessionRevoked(sessionId);
    return { wasCurrent: currentSessionId === sessionId };
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<AuthUserResponseDto> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (dto.firstName !== undefined) {
      user.firstName = dto.firstName.trim();
    }
    if (dto.lastName !== undefined) {
      user.lastName = dto.lastName.trim();
    }
    const opt = (v: string | undefined) =>
      v === undefined ? undefined : v.trim() || null;
    if (dto.phoneWhatsapp !== undefined) {
      user.phoneWhatsapp = opt(dto.phoneWhatsapp) ?? null;
    }
    if (dto.socialDiscord !== undefined) {
      user.socialDiscord = opt(dto.socialDiscord) ?? null;
    }
    if (dto.socialLinkedin !== undefined) {
      user.socialLinkedin = opt(dto.socialLinkedin) ?? null;
    }
    if (dto.socialYoutube !== undefined) {
      user.socialYoutube = opt(dto.socialYoutube) ?? null;
    }
    if (dto.socialInstagram !== undefined) {
      user.socialInstagram = opt(dto.socialInstagram) ?? null;
    }
    if (dto.socialFacebook !== undefined) {
      user.socialFacebook = opt(dto.socialFacebook) ?? null;
    }
    if (dto.websiteUrl !== undefined) {
      user.websiteUrl = opt(dto.websiteUrl) ?? null;
    }
    await this.usersService.save(user);
    return this.toUserResponse(user);
  }

  async updatePresence(
    userId: string,
    status: PresenceStatus,
  ): Promise<AuthUserResponseDto> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    user.presenceStatus = status;
    await this.usersService.save(user);
    void this.contactsService
      .notifyFriendsPresenceChanged(userId, status)
      .catch((err: Error) => {
        this.logger.warn(`notifyFriendsPresenceChanged: ${err.message}`);
      });
    return this.toUserResponse(user);
  }

  async deactivateAccount(
    userId: string,
    dto: DeactivateAccountDto,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.passwordHash) {
      if (!dto.password?.trim()) {
        throw new BadRequestException(
          'Indique a senha para desativar a conta.',
        );
      }
      const ok = await argon2.verify(user.passwordHash, dto.password);
      if (!ok) {
        throw new BadRequestException('Senha incorreta');
      }
    }
    user.accountDisabledAt = new Date();
    await this.usersService.save(user);
    await this.refreshRepo.update(
      { userId: user.id, deleted: false },
      { deleted: true, deletedAt: new Date() },
    );
    return {
      message:
        'Conta desativada. Para voltar a usar o SyncYou, reative a conta no ecrã de início de sessão.',
    };
  }

  async deleteAccount(
    userId: string,
    dto: DeleteAccountDto,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.passwordHash) {
      if (!dto.password?.trim()) {
        throw new BadRequestException(
          'Indique a senha para eliminar a conta definitivamente.',
        );
      }
      const ok = await argon2.verify(user.passwordHash, dto.password);
      if (!ok) {
        throw new BadRequestException('Senha incorreta');
      }
    }
    user.deleted = true;
    user.deletedAt = new Date();
    await this.usersService.save(user);
    await this.refreshRepo.update(
      { userId: user.id, deleted: false },
      { deleted: true, deletedAt: new Date() },
    );
    return {
      message:
        'A sua conta foi eliminada. Os dados serão tratados conforme a política de privacidade.',
    };
  }

  async reactivateAccount(
    dto: ReactivateAccountDto,
  ): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findActiveByEmail(email);
    if (!user) {
      throw new BadRequestException('Credenciais inválidas');
    }
    if (!user.accountDisabledAt) {
      throw new BadRequestException('Esta conta não está desativada');
    }
    if (user.passwordHash == null) {
      throw new BadRequestException(
        'Esta conta não tem senha. Inicie sessão com Google ou Microsoft.',
      );
    }
    const ok = await argon2.verify(user.passwordHash, dto.password);
    if (!ok) {
      throw new BadRequestException('Credenciais inválidas');
    }
    user.accountDisabledAt = null;
    await this.usersService.save(user);
    return { message: 'Conta reativada. Já pode iniciar sessão.' };
  }

  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }

    if (user.passwordHash == null) {
      throw new BadRequestException(
        'Esta conta não tem senha. Inicie sessão com Google ou Microsoft, ou use recuperar senha para definir uma.',
      );
    }

    const ok = await argon2.verify(user.passwordHash, dto.currentPassword);
    if (!ok) {
      throw new BadRequestException('Senha atual incorreta');
    }

    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.usersService.save(user);

    await this.refreshRepo.update(
      { userId: user.id, deleted: false },
      { deleted: true, deletedAt: new Date() },
    );

    return { message: 'Senha atualizada. Inicie sessão novamente em outros dispositivos se necessário.' };
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const email = dto.email.toLowerCase().trim();
    const user = await this.usersService.findActiveByEmail(email);

    const generic = {
      message:
        'Se existir uma conta com este email, receberá um código em breve.',
    };

    if (!user || !user.emailVerifiedAt) {
      return generic;
    }

    await this.otpRepo.update(
      {
        email,
        deleted: false,
        consumedAt: IsNull(),
        purpose: OTP_PURPOSE_FORGOT_PASSWORD,
      },
      { deleted: true, deletedAt: new Date() },
    );

    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const codeHash = this.hashOtp(code);

    const otp = this.otpRepo.create({
      email,
      purpose: OTP_PURPOSE_FORGOT_PASSWORD,
      codeHash,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      consumedAt: null,
      deleted: false,
      deletedAt: null,
    });
    await this.otpRepo.save(otp);

    try {
      await this.mailer.sendMail({
        to: email,
        subject: 'Código para redefinir senha — SyncYou',
        template: 'password-reset-otp',
        context: {
          name: user.firstName,
          code,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Forgot password: email não enviado (${err instanceof Error ? err.message : String(err)}).`,
      );
    }

    return generic;
  }

  async verifyOtp(
    dto: VerifyOtpDto,
  ): Promise<{ resetToken: string; expiresIn: string }> {
    const email = dto.email.toLowerCase().trim();
    const row = await this.otpRepo.findOne({
      where: {
        email,
        purpose: OTP_PURPOSE_FORGOT_PASSWORD,
        deleted: false,
        consumedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });

    if (!row || row.expiresAt < new Date()) {
      throw new BadRequestException('Código inválido ou expirado');
    }

    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Muitas tentativas. Solicite um novo código.');
    }

    row.attempts += 1;
    await this.otpRepo.save(row);

    const expected = row.codeHash;
    const actual = this.hashOtp(dto.code);
    if (expected !== actual) {
      throw new BadRequestException('Código incorreto');
    }

    const user = await this.usersService.findActiveByEmail(email);
    if (!user) {
      throw new BadRequestException('Código inválido');
    }

    row.consumedAt = new Date();
    row.deleted = true;
    row.deletedAt = new Date();
    await this.otpRepo.save(row);

    const resetToken = await this.jwtService.signAsync(
      { sub: user.id, typ: 'password_reset' },
      {
        expiresIn: this.jwtCfg
          .passwordResetExpiresIn as SignOptions['expiresIn'],
      },
    );

    return {
      resetToken,
      expiresIn: this.jwtCfg.passwordResetExpiresIn,
    };
  }

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    let payload: { sub: string; typ?: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; typ?: string }>(
        dto.resetToken,
      );
    } catch {
      throw new BadRequestException('Token de redefinição inválido ou expirado');
    }

    if (payload.typ !== 'password_reset') {
      throw new BadRequestException('Token inválido');
    }

    const user = await this.usersService.findActiveById(payload.sub);
    if (!user) {
      throw new BadRequestException('Utilizador inválido');
    }

    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.usersService.save(user);

    await this.refreshRepo.update(
      { userId: user.id, deleted: false },
      { deleted: true, deletedAt: new Date() },
    );

    return { message: 'Senha redefinida com sucesso.' };
  }

  private oauthFrontendBase(redirectOverride?: string): string {
    const def = this.oauthCfg.frontendRedirectUrl.replace(/\/$/, '');
    if (!redirectOverride?.trim()) return def;
    const n = redirectOverride.trim().replace(/\/$/, '');
    if (this.oauthCfg.frontendRedirectAllowlist.includes(n)) return n;
    return def;
  }

  private oauthSignUrl(
    params: Record<string, string>,
    redirectOverride?: string,
  ): string {
    const base = this.oauthFrontendBase(redirectOverride);
    const u = new URL(base);
    for (const [k, v] of Object.entries(params)) {
      u.searchParams.set(k, v);
    }
    return u.toString();
  }

  private oauthSuccessRedirect(
    tokens: TokensResponseDto,
    redirectOverride?: string,
  ): string {
    return this.oauthSignUrl(
      {
        oauth: 'ok',
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        expires_in: String(tokens.expiresIn),
      },
      redirectOverride,
    );
  }

  /** Tokens enviados por Socket.IO para a app Tauri; o browser só recebe oauth=ok&socket=1. */
  private oauthSuccessRedirectSocket(
    tokens: TokensResponseDto,
    redirectOverride: string | undefined,
    bridgeId: string,
  ): string {
    this.oauthBridge.emit(bridgeId, {
      kind: 'tokens',
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
    });
    return this.oauthSignUrl({ oauth: 'ok', socket: '1' }, redirectOverride);
  }

  private oauthSignupRedirectSocket(
    signupToken: string,
    redirectOverride: string | undefined,
    bridgeId: string,
  ): string {
    this.oauthBridge.emit(bridgeId, { kind: 'signup', signupToken });
    return this.oauthSignUrl({ oauth: 'signup', socket: '1' }, redirectOverride);
  }

  private async oauthReactivateRedirectSocket(
    reactivationToken: string,
    redirectOverride: string | undefined,
    bridgeId: string,
  ): Promise<string> {
    this.oauthBridge.emit(bridgeId, {
      kind: 'disabled_confirm',
      reactivationToken,
    });
    return this.oauthSignUrl({ oauth: 'reactivate', socket: '1' }, redirectOverride);
  }

  async buildOAuthRedirectUrl(
    profile: OAuthProfilePayload,
    frontendRedirectOverride?: string,
    bridgeId?: string,
    req?: Request,
    clientPublicIpFromState?: string,
  ): Promise<string> {
    const fail = (code: string, message?: string) => {
      if (bridgeId) {
        this.oauthBridge.emit(bridgeId, { kind: 'error', code, message });
      }
      return this.oauthSignUrl(
        {
          oauth: 'err',
          code,
          ...(message ? { message } : {}),
          ...(bridgeId ? { socket: '1' } : {}),
        },
        frontendRedirectOverride,
      );
    };

    const existing = await this.usersService.findByProviderAndSubject(
      profile.provider,
      profile.oauthSubject,
    );
    if (existing) {
      if (!existing.emailVerifiedAt) {
        return fail('EMAIL_NOT_VERIFIED');
      }
      if (existing.accountDisabledAt) {
        const reactivationToken = await this.signOAuthReactivateToken(existing.id);
        if (bridgeId) {
          return this.oauthReactivateRedirectSocket(
            reactivationToken,
            frontendRedirectOverride,
            bridgeId,
          );
        }
        return this.oauthSignUrl(
          {
            oauth: 'reactivate',
            reactivation_token: reactivationToken,
          },
          frontendRedirectOverride,
        );
      }
      if (existing.totpSecret && existing.twoFactorEnabledAt) {
        const tempToken = await this.sign2faTempToken(existing.id);
        if (bridgeId) {
          this.oauthBridge.emit(bridgeId, {
            kind: '2fa_required',
            tempToken,
          });
          return this.oauthSignUrl(
            { oauth: '2fa', socket: '1' },
            frontendRedirectOverride,
          );
        }
        return this.oauthSignUrl(
          {
            oauth: '2fa',
            temp_token: tempToken,
          },
          frontendRedirectOverride,
        );
      }
      const oauthLoginMethod =
        profile.provider === 'google' ? 'oauth_google' : 'oauth_microsoft';
      const tokens = await this.issueTokens(existing, {
        req,
        loginMethod: oauthLoginMethod,
        clientPublicIp: clientPublicIpFromState,
      });
      return bridgeId
        ? this.oauthSuccessRedirectSocket(
            tokens,
            frontendRedirectOverride,
            bridgeId,
          )
        : this.oauthSuccessRedirect(tokens, frontendRedirectOverride);
    }

    const byEmail = await this.usersService.findActiveByEmail(profile.email);

    /** Conta só com email+senha: vincular o mesmo email verificado pelo IdP OAuth. */
    if (byEmail?.passwordHash && !byEmail.oauthSubject) {
      if (!byEmail.emailVerifiedAt) {
        byEmail.emailVerifiedAt = new Date();
      }
      byEmail.oauthSubject = profile.oauthSubject;
      byEmail.authProvider = profile.provider;
      await this.usersService.save(byEmail);
      /** Não substituir foto já definida (ex.: upload em /auth/me/avatar ou registo com foto). */
      if (!byEmail.avatarUrl?.trim()) {
        const avatarUrl = await this.maybeSaveAvatarFromUrl(byEmail.id, profile.picture);
        if (avatarUrl) {
          byEmail.avatarUrl = avatarUrl;
          await this.usersService.save(byEmail);
        }
      }
      const oauthLoginMethod =
        profile.provider === 'google' ? 'oauth_google' : 'oauth_microsoft';
      const tokens = await this.issueTokens(byEmail, {
        req,
        loginMethod: oauthLoginMethod,
        clientPublicIp: clientPublicIpFromState,
      });
      return bridgeId
        ? this.oauthSuccessRedirectSocket(
            tokens,
            frontendRedirectOverride,
            bridgeId,
          )
        : this.oauthSuccessRedirect(tokens, frontendRedirectOverride);
    }

    if (byEmail?.passwordHash) {
      return fail(
        'OAUTH_ACCOUNT_CONFLICT',
        'Este email já está associado a outro método de início de sessão.',
      );
    }
    if (byEmail) {
      return fail(
        'OAUTH_ACCOUNT_CONFLICT',
        'Este email já está associado a outro método de início de sessão.',
      );
    }

    const signupToken = await this.jwtService.signAsync(
      {
        typ: 'oauth_signup',
        email: profile.email,
        provider: profile.provider,
        oauthSubject: profile.oauthSubject,
        firstName: profile.firstName,
        lastName: profile.lastName,
        picture: profile.picture,
      },
      { expiresIn: '15m' },
    );

    return bridgeId
      ? this.oauthSignupRedirectSocket(
          signupToken,
          frontendRedirectOverride,
          bridgeId,
        )
      : this.oauthSignUrl(
          {
            oauth: 'signup',
            signup_token: signupToken,
          },
          frontendRedirectOverride,
        );
  }

  async completeOAuthSignup(
    dto: OAuthCompleteDto,
    req?: Request,
  ): Promise<TokensResponseDto> {
    let payload: {
      typ?: string;
      email: string;
      provider: 'google' | 'microsoft';
      oauthSubject: string;
      firstName: string;
      lastName: string;
      picture: string | null;
    };
    try {
      payload = await this.jwtService.verifyAsync(dto.signupToken);
    } catch {
      throw new BadRequestException('Token de registo inválido ou expirado');
    }

    if (payload.typ !== 'oauth_signup') {
      throw new BadRequestException('Token inválido');
    }

    const email = payload.email.toLowerCase().trim();
    const dupe = await this.usersService.findActiveByEmail(email);
    if (dupe) {
      throw new ConflictException('Conta já criada. Inicie sessão.');
    }

    const dupeOAuth = await this.usersService.findByProviderAndSubject(
      payload.provider,
      payload.oauthSubject,
    );
    if (dupeOAuth) {
      throw new ConflictException('Conta já criada. Inicie sessão.');
    }

    const user = this.usersService.createPartial({
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      email,
      passwordHash: null,
      authProvider: payload.provider,
      oauthSubject: payload.oauthSubject,
      encryptionPublicKey: dto.encryptionPublicKey?.trim() ?? null,
      emailVerifiedAt: new Date(),
      emailVerificationToken: null,
      avatarUrl: null,
    });

    const saved = await this.usersService.save(user);

    const avatarUrl = await this.maybeSaveAvatarFromUrl(saved.id, payload.picture);
    if (avatarUrl) {
      saved.avatarUrl = avatarUrl;
      await this.usersService.save(saved);
    }

    return this.issueTokens(saved, {
      req,
      loginMethod: 'oauth_register',
      clientPublicIp: dto.clientPublicIp,
    });
  }

  async requestPasswordChangeOtp(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!user.passwordHash) {
      throw new BadRequestException(
        'Esta conta não tem senha local. Utilize recuperação de senha ou OAuth.',
      );
    }
    const email = user.email.toLowerCase().trim();
    await this.otpRepo.update(
      {
        email,
        purpose: OTP_PURPOSE_PASSWORD_CHANGE,
        deleted: false,
        consumedAt: IsNull(),
      },
      { deleted: true, deletedAt: new Date() },
    );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = this.otpRepo.create({
      email,
      purpose: OTP_PURPOSE_PASSWORD_CHANGE,
      codeHash: this.hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      consumedAt: null,
      deleted: false,
      deletedAt: null,
    });
    await this.otpRepo.save(otp);
    try {
      await this.mailer.sendMail({
        to: email,
        subject: 'Código para alterar senha — SyncYou',
        template: 'password-reset-otp',
        context: {
          name: user.firstName,
          code,
        },
      });
    } catch (err) {
      this.logger.warn(
        `Password change OTP: email não enviado (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
    return { message: 'Enviámos um código de 6 dígitos para o seu email.' };
  }

  async verifyPasswordChangeOtp(
    userId: string,
    dto: PasswordChangeVerifyDto,
  ): Promise<{ changeToken: string; expiresIn: string }> {
    const user = await this.usersService.findActiveById(userId);
    if (!user?.passwordHash) {
      throw new BadRequestException('Operação inválida.');
    }
    const email = user.email.toLowerCase().trim();
    const row = await this.otpRepo.findOne({
      where: {
        email,
        purpose: OTP_PURPOSE_PASSWORD_CHANGE,
        deleted: false,
        consumedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.expiresAt < new Date()) {
      throw new BadRequestException('Código inválido ou expirado');
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Muitas tentativas. Solicite um novo código.');
    }
    row.attempts += 1;
    await this.otpRepo.save(row);
    if (this.hashOtp(dto.code) !== row.codeHash) {
      throw new BadRequestException('Código incorreto');
    }
    row.consumedAt = new Date();
    row.deleted = true;
    row.deletedAt = new Date();
    await this.otpRepo.save(row);

    const changeToken = await this.jwtService.signAsync(
      { sub: user.id, typ: 'password_change_via_otp' },
      {
        expiresIn: this.jwtCfg
          .passwordResetExpiresIn as SignOptions['expiresIn'],
      },
    );
    return {
      changeToken,
      expiresIn: this.jwtCfg.passwordResetExpiresIn,
    };
  }

  async completePasswordChangeViaOtp(
    dto: PasswordChangeCompleteDto,
  ): Promise<{ message: string }> {
    if (dto.newPassword !== dto.confirmPassword) {
      throw new BadRequestException('As senhas não coincidem');
    }
    let payload: { sub: string; typ?: string };
    try {
      payload = await this.jwtService.verifyAsync<{ sub: string; typ?: string }>(
        dto.changeToken,
      );
    } catch {
      throw new BadRequestException('Token inválido ou expirado');
    }
    if (payload.typ !== 'password_change_via_otp') {
      throw new BadRequestException('Token inválido');
    }
    const user = await this.usersService.findActiveById(payload.sub);
    if (!user?.passwordHash) {
      throw new BadRequestException('Operação inválida');
    }
    user.passwordHash = await argon2.hash(dto.newPassword, {
      type: argon2.argon2id,
    });
    await this.usersService.save(user);
    await this.refreshRepo.update(
      { userId: user.id, deleted: false },
      { deleted: true, deletedAt: new Date() },
    );
    return { message: 'Senha atualizada. Inicie sessão novamente em outros dispositivos.' };
  }

  async requestTwoFactorEnableOtp(userId: string): Promise<{ message: string }> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!user.emailVerifiedAt) {
      throw new BadRequestException('Confirme o email antes de ativar 2FA.');
    }
    if (user.twoFactorEnabledAt && user.totpSecret) {
      throw new BadRequestException('2FA já está ativo.');
    }
    if (user.pendingTotpSecret) {
      user.pendingTotpSecret = null;
      await this.usersService.save(user);
    }
    const email = user.email.toLowerCase().trim();
    await this.otpRepo.update(
      {
        email,
        purpose: OTP_PURPOSE_TWO_FACTOR_ENABLE,
        deleted: false,
        consumedAt: IsNull(),
      },
      { deleted: true, deletedAt: new Date() },
    );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const otp = this.otpRepo.create({
      email,
      purpose: OTP_PURPOSE_TWO_FACTOR_ENABLE,
      codeHash: this.hashOtp(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      attempts: 0,
      consumedAt: null,
      deleted: false,
      deletedAt: null,
    });
    await this.otpRepo.save(otp);
    try {
      await this.mailer.sendMail({
        to: email,
        subject: 'Código para ativar autenticação em dois fatores — SyncYou',
        template: 'password-reset-otp',
        context: {
          name: user.firstName,
          code,
        },
      });
    } catch (err) {
      this.logger.warn(
        `2FA OTP: email não enviado (${err instanceof Error ? err.message : String(err)}).`,
      );
    }
    return { message: 'Enviámos um código para o seu email.' };
  }

  async verifyTwoFactorEmailAndPrepareQr(
    userId: string,
    dto: TwoFactorVerifyEmailDto,
  ): Promise<{ otpauthUrl: string; qrDataUrl: string; manualSecret: string }> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (user.twoFactorEnabledAt && user.totpSecret) {
      throw new BadRequestException('2FA já está ativo.');
    }
    const email = user.email.toLowerCase().trim();
    const row = await this.otpRepo.findOne({
      where: {
        email,
        purpose: OTP_PURPOSE_TWO_FACTOR_ENABLE,
        deleted: false,
        consumedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
    if (!row || row.expiresAt < new Date()) {
      throw new BadRequestException('Código inválido ou expirado');
    }
    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Muitas tentativas. Solicite um novo código.');
    }
    row.attempts += 1;
    await this.otpRepo.save(row);
    if (this.hashOtp(dto.code) !== row.codeHash) {
      throw new BadRequestException('Código incorreto');
    }
    row.consumedAt = new Date();
    row.deleted = true;
    row.deletedAt = new Date();
    await this.otpRepo.save(row);

    const secret = generateSecret();
    user.pendingTotpSecret = secret;
    await this.usersService.save(user);

    const otpauthUrl = generateURI({
      issuer: 'SyncYou',
      label: user.email,
      secret,
    });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl, {
      width: 240,
      margin: 2,
      errorCorrectionLevel: 'M',
    });
    return { otpauthUrl, qrDataUrl, manualSecret: secret };
  }

  async confirmTwoFactorTotp(
    userId: string,
    dto: TwoFactorConfirmTotpDto,
  ): Promise<AuthUserResponseDto> {
    const user = await this.usersService.findActiveById(userId);
    if (!user?.pendingTotpSecret) {
      throw new BadRequestException('Conclua primeiro o passo do email e do QR code.');
    }
    const result = verifySync({
      secret: user.pendingTotpSecret,
      token: dto.code,
    });
    if (!result.valid) {
      throw new BadRequestException('Código da app autenticadora incorreto.');
    }
    user.totpSecret = user.pendingTotpSecret;
    user.pendingTotpSecret = null;
    user.twoFactorEnabledAt = new Date();
    await this.usersService.save(user);
    return this.toUserResponse(user);
  }

  async disableTwoFactor(
    userId: string,
    dto: TwoFactorDisableDto,
  ): Promise<AuthUserResponseDto> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    if (!user.totpSecret || !user.twoFactorEnabledAt) {
      throw new BadRequestException('2FA não está ativo.');
    }
    if (user.passwordHash) {
      if (!dto.password?.trim()) {
        throw new BadRequestException('Indique a senha para desativar o 2FA.');
      }
      const ok = await argon2.verify(user.passwordHash, dto.password);
      if (!ok) {
        throw new BadRequestException('Senha incorreta');
      }
    }
    user.totpSecret = null;
    user.pendingTotpSecret = null;
    user.twoFactorEnabledAt = null;
    await this.usersService.save(user);
    await this.refreshRepo.update(
      { userId: user.id, deleted: false },
      { deleted: true, deletedAt: new Date() },
    );
    return this.toUserResponse(user);
  }

  private async maybeSaveAvatarFromUrl(
    userId: string,
    url: string | null,
  ): Promise<string | null> {
    if (!url?.startsWith('http')) {
      return null;
    }
    try {
      const res = await fetch(url);
      if (!res.ok) {
        return null;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 32 || buf.length > 5 * 1024 * 1024) {
        return null;
      }
      const dir = join(process.cwd(), 'data', 'uploads', 'avatars');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const relative = `avatars/${userId}.jpg`;
      await writeFile(join(process.cwd(), 'data', 'uploads', relative), buf);
      return relative;
    } catch {
      return null;
    }
  }

  async updateAvatar(
    userId: string,
    file: Express.Multer.File | undefined,
  ): Promise<AuthUserResponseDto> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Envie uma imagem.');
    }
    const mime = (file.mimetype ?? '').toLowerCase();
    const allowed = new Set(['image/jpeg', 'image/png', 'image/webp']);
    if (!allowed.has(mime)) {
      throw new BadRequestException('Use JPEG, PNG ou WebP.');
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Imagem demasiado grande (máx. 5 MB).');
    }
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    const ext = extMap[mime]!;
    const relative = `avatars/${userId}.${ext}`;
    const uploadsRoot = join(process.cwd(), 'data', 'uploads');
    const avatarsDir = join(uploadsRoot, 'avatars');
    if (!existsSync(avatarsDir)) {
      mkdirSync(avatarsDir, { recursive: true });
    }
    for (const oldExt of ['jpg', 'png', 'webp']) {
      if (oldExt === ext) {
        continue;
      }
      try {
        await unlink(join(avatarsDir, `${userId}.${oldExt}`));
      } catch {
        /* ficheiro inexistente */
      }
    }
    await writeFile(join(uploadsRoot, relative), file.buffer);
    user.avatarUrl = relative;
    await this.usersService.save(user);
    return this.toUserResponse(user);
  }

  async confirmEmail(token: string): Promise<string> {
    const scheme = this.config.getOrThrow<{ deepLinkScheme: string }>('app')
      .deepLinkScheme;
    const path = this.config.getOrThrow<{ deepLinkPathAfterEmailConfirm: string }>(
      'app',
    ).deepLinkPathAfterEmailConfirm;

    const baseDeep = `${scheme}://${path}`;

    if (!token?.length) {
      return `${baseDeep}?status=invalid`;
    }

    const found = await this.usersService.findByEmailVerificationToken(token);

    if (!found) {
      return `${baseDeep}?status=invalid`;
    }

    if (found.emailVerifiedAt) {
      return `${baseDeep}?status=already`;
    }

    found.emailVerifiedAt = new Date();
    found.emailVerificationToken = null;
    await this.usersService.save(found);

    return `${baseDeep}?status=ok`;
  }
}
