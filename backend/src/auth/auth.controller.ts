import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { consumeOAuthRedirectState } from './oauth-redirect-state.store';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AuthService } from './auth.service';
import { CurrentUser, type AuthUserPayload } from './decorators/current-user.decorator';
import { AuthUserResponseDto } from './dto/auth-user-response.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { DeactivateAccountDto } from './dto/deactivate-account.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { ReactivateAccountDto } from './dto/reactivate-account.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePresenceDto } from './dto/update-presence.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { RegisterResponseDto } from './dto/register-response.dto';
import { TokensResponseDto } from './dto/tokens-response.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SessionsResponseDto } from './dto/sessions-response.dto';
import { OAuthCompleteDto } from './dto/oauth-complete.dto';
import { OAuthReactivateDto } from './dto/oauth-reactivate.dto';
import { Login2faDto } from './dto/login-2fa.dto';
import { PasswordChangeVerifyDto } from './dto/password-change-verify.dto';
import { PasswordChangeCompleteDto } from './dto/password-change-complete.dto';
import { TwoFactorVerifyEmailDto } from './dto/two-factor-verify-email.dto';
import { TwoFactorConfirmTotpDto } from './dto/two-factor-confirm-totp.dto';
import { TwoFactorDisableDto } from './dto/two-factor-disable.dto';
import { GoogleOAuthAuthGuard } from './guards/google-oauth-auth.guard';
import { MicrosoftOAuthAuthGuard } from './guards/microsoft-oauth-auth.guard';
import { OAuthGoogleEnabledGuard } from './guards/oauth-google-enabled.guard';
import { OAuthMicrosoftEnabledGuard } from './guards/oauth-microsoft-enabled.guard';
import type { OAuthProfilePayload } from './types/oauth-profile.types';

@ApiTags('auth')
@Controller('auth')
@Throttle({ default: { limit: 30, ttl: 60000 } })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registo com foto opcional; envia email de confirmação' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: [
        'firstName',
        'lastName',
        'email',
        'password',
        'confirmPassword',
      ],
      properties: {
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
        password: { type: 'string' },
        confirmPassword: { type: 'string' },
        encryptionPublicKey: { type: 'string' },
        photo: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 201, type: RegisterResponseDto })
  @ApiResponse({ status: 409, description: 'Email já registado' })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async register(
    @Body() dto: RegisterDto,
    @UploadedFile() photo: Express.Multer.File | undefined,
  ): Promise<RegisterResponseDto> {
    return this.authService.register(dto, photo);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login (requer email confirmado)' })
  @ApiResponse({ status: 200, type: TokensResponseDto })
  @ApiResponse({
    status: 401,
    description:
      'Credenciais inválidas; ou code USER_NOT_FOUND / OAUTH_ONLY no corpo JSON',
  })
  @ApiResponse({ status: 403, description: 'Conta não ativada / TWO_FACTOR_REQUIRED' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
  ): Promise<TokensResponseDto> {
    return this.authService.login(dto, req);
  }

  @Post('login/2fa')
  @ApiOperation({ summary: 'Concluir login após 2FA (TOTP)' })
  @ApiResponse({ status: 200, type: TokensResponseDto })
  async login2fa(
    @Body() dto: Login2faDto,
    @Req() req: Request,
  ): Promise<TokensResponseDto> {
    return this.authService.completeLogin2fa(dto, req);
  }

  @Post('password-change/complete')
  @ApiOperation({ summary: 'Definir nova senha após OTP (sem JWT)' })
  async completePasswordChangeViaOtp(
    @Body() dto: PasswordChangeCompleteDto,
  ): Promise<{ message: string }> {
    return this.authService.completePasswordChangeViaOtp(dto);
  }

  @Post('oauth/reactivate')
  @ApiOperation({
    summary:
      'Reativar conta desativada após OAuth (JWT devolvido em oauth=reactivate no callback)',
  })
  @ApiResponse({ status: 200, type: TokensResponseDto })
  @ApiResponse({ status: 400, description: 'Token inválido' })
  async oauthReactivate(
    @Body() dto: OAuthReactivateDto,
    @Req() req: Request,
  ): Promise<TokensResponseDto> {
    return this.authService.oauthReactivateWithToken(
      dto.reactivationToken,
      req,
      dto.clientPublicIp,
    );
  }

  @Get('google')
  @UseGuards(OAuthGoogleEnabledGuard, GoogleOAuthAuthGuard)
  @ApiOperation({
    summary: 'Iniciar OAuth Google (redirect)',
    description:
      'Opcional: redirect_uri (allowlist) para browser externo + deep link (ex. syncyou://oauth/callback).',
  })
  @ApiResponse({ status: 302, description: 'Redirect para Google' })
  googleAuth(): void {
    /* Passport redireciona */
  }

  @Get('google/callback')
  @UseGuards(OAuthGoogleEnabledGuard, GoogleOAuthAuthGuard)
  @ApiOperation({ summary: 'Callback Google OAuth' })
  @ApiResponse({ status: 302, description: 'Redirect para frontend (hash com tokens ou signup)' })
  async googleCallback(
    @Req() req: Request & { user: OAuthProfilePayload; query?: { state?: string } },
    @Res() res: Response,
  ): Promise<void> {
    const consumed = consumeOAuthRedirectState(req.query?.state);
    const fr = consumed?.redirectUri ?? req.cookies?.oauth_fr;
    const bridgeId = consumed?.bridgeId;
    if (typeof req.cookies?.oauth_fr === 'string') {
      res.clearCookie('oauth_fr', { path: '/' });
    }
    const url = await this.authService.buildOAuthRedirectUrl(
      req.user,
      typeof fr === 'string' ? fr : undefined,
      bridgeId,
      req,
      consumed?.clientPublicIp,
    );
    res.redirect(302, url);
  }

  @Get('microsoft')
  @UseGuards(OAuthMicrosoftEnabledGuard, MicrosoftOAuthAuthGuard)
  @ApiOperation({
    summary: 'Iniciar OAuth Microsoft (redirect)',
    description:
      'Opcional: redirect_uri (allowlist) para browser externo + deep link (ex. syncyou://oauth/callback).',
  })
  @ApiResponse({ status: 302, description: 'Redirect para Microsoft' })
  microsoftAuth(): void {
    /* Passport redireciona */
  }

  @Get('microsoft/callback')
  @UseGuards(OAuthMicrosoftEnabledGuard, MicrosoftOAuthAuthGuard)
  @ApiOperation({ summary: 'Callback Microsoft OAuth' })
  @ApiResponse({ status: 302, description: 'Redirect para frontend (hash com tokens ou signup)' })
  async microsoftCallback(
    @Req() req: Request & { user: OAuthProfilePayload; query?: { state?: string } },
    @Res() res: Response,
  ): Promise<void> {
    const consumed = consumeOAuthRedirectState(req.query?.state);
    const fr = consumed?.redirectUri ?? req.cookies?.oauth_fr;
    const bridgeId = consumed?.bridgeId;
    if (typeof req.cookies?.oauth_fr === 'string') {
      res.clearCookie('oauth_fr', { path: '/' });
    }
    const url = await this.authService.buildOAuthRedirectUrl(
      req.user,
      typeof fr === 'string' ? fr : undefined,
      bridgeId,
      req,
      consumed?.clientPublicIp,
    );
    res.redirect(302, url);
  }

  @Post('oauth/complete')
  @ApiOperation({
    summary: 'Concluir registo após OAuth (JWT com typ oauth_signup no callback)',
  })
  @ApiResponse({ status: 200, type: TokensResponseDto })
  @ApiResponse({ status: 400, description: 'Token inválido' })
  @ApiResponse({ status: 409, description: 'Conta já existente' })
  async oauthComplete(
    @Body() dto: OAuthCompleteDto,
    @Req() req: Request,
  ): Promise<TokensResponseDto> {
    return this.authService.completeOAuthSignup(dto, req);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Novo access token (rotação do refresh)' })
  @ApiResponse({ status: 200, type: TokensResponseDto })
  @ApiResponse({ status: 401, description: 'Refresh inválido' })
  async refresh(@Body() dto: RefreshDto): Promise<TokensResponseDto> {
    return this.authService.refresh(dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Dados do utilizador autenticado' })
  @ApiResponse({ status: 200, type: AuthUserResponseDto })
  @ApiResponse({ status: 401, description: 'Não autorizado' })
  async me(@CurrentUser() user: { userId: string }): Promise<AuthUserResponseDto> {
    return this.authService.me(user.userId);
  }

  @Get('me/sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Sessões activas (refresh tokens) e histórico recente de inícios de sessão',
  })
  @ApiResponse({ status: 200, type: SessionsResponseDto })
  async listSessions(@CurrentUser() user: AuthUserPayload): Promise<SessionsResponseDto> {
    return this.authService.listSessions(user.userId, user.sessionId);
  }

  @Delete('me/sessions/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Desligar outra sessão (revoga o refresh token)' })
  @ApiResponse({ status: 200, description: '{ wasCurrent: boolean }' })
  async revokeSession(
    @CurrentUser() user: AuthUserPayload,
    @Param('id') id: string,
  ): Promise<{ wasCurrent: boolean }> {
    return this.authService.revokeSession(user.userId, id, user.sessionId);
  }

  @Patch('me/avatar')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Atualizar foto de perfil (JPEG, PNG ou WebP, máx. 5 MB)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { photo: { type: 'string', format: 'binary' } },
    },
  })
  @ApiResponse({ status: 200, type: AuthUserResponseDto })
  @ApiResponse({ status: 400, description: 'Ficheiro inválido' })
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updateAvatar(
    @CurrentUser() user: { userId: string },
    @UploadedFile() photo: Express.Multer.File | undefined,
  ): Promise<AuthUserResponseDto> {
    return this.authService.updateAvatar(user.userId, photo);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Atualizar dados do perfil (nome, contactos, redes)' })
  @ApiResponse({ status: 200, type: AuthUserResponseDto })
  async updateProfile(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdateProfileDto,
  ): Promise<AuthUserResponseDto> {
    return this.authService.updateProfile(user.userId, dto);
  }

  @Patch('me/presence')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Atualizar estado de presença (online, ausente, ocupado, invisível)' })
  @ApiResponse({ status: 200, type: AuthUserResponseDto })
  async updatePresence(
    @CurrentUser() user: { userId: string },
    @Body() dto: UpdatePresenceDto,
  ): Promise<AuthUserResponseDto> {
    return this.authService.updatePresence(user.userId, dto.status);
  }

  @Post('me/deactivate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Desativar conta (bloqueia acesso até reativar com email/senha)',
  })
  async deactivateAccount(
    @CurrentUser() user: { userId: string },
    @Body() dto: DeactivateAccountDto,
  ): Promise<{ message: string }> {
    return this.authService.deactivateAccount(user.userId, dto);
  }

  @Post('me/delete')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Eliminar conta (remoção lógica). Confirmação: texto EXCLUIR',
  })
  async deleteAccount(
    @CurrentUser() user: { userId: string },
    @Body() dto: DeleteAccountDto,
  ): Promise<{ message: string }> {
    return this.authService.deleteAccount(user.userId, dto);
  }

  @Post('reactivate')
  @ApiOperation({
    summary: 'Reativar conta desativada (email + senha)',
  })
  async reactivateAccount(
    @Body() dto: ReactivateAccountDto,
  ): Promise<{ message: string }> {
    return this.authService.reactivateAccount(dto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Pedir código OTP por email' })
  @ApiResponse({ status: 200, description: 'Resposta genérica (anti-enumeração)' })
  async forgotPassword(
    @Body() dto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.forgotPassword(dto);
  }

  @Post('verify-otp')
  @ApiOperation({ summary: 'Validar OTP e obter token para redefinir senha' })
  @ApiResponse({ status: 200, description: 'resetToken JWT de curta duração' })
  @ApiResponse({ status: 400, description: 'Código inválido' })
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Redefinir senha com token de verify-otp' })
  @ApiResponse({ status: 200, description: 'Senha atualizada' })
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(dto);
  }

  @Patch('password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Alterar senha (sessão actual)' })
  @ApiResponse({ status: 200, description: 'Senha alterada; refresh tokens revogados' })
  async changePassword(
    @CurrentUser() user: { userId: string },
    @Body() dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    return this.authService.changePassword(user.userId, dto);
  }

  @Post('me/password-change/request-otp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Pedir código OTP por email para alterar senha (sem senha actual)' })
  async requestPasswordChangeOtp(
    @CurrentUser() user: { userId: string },
  ): Promise<{ message: string }> {
    return this.authService.requestPasswordChangeOtp(user.userId);
  }

  @Post('me/password-change/verify-otp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Validar OTP e obter token para definir nova senha' })
  async verifyPasswordChangeOtp(
    @CurrentUser() user: { userId: string },
    @Body() dto: PasswordChangeVerifyDto,
  ): Promise<{ changeToken: string; expiresIn: string }> {
    return this.authService.verifyPasswordChangeOtp(user.userId, dto);
  }

  @Post('me/2fa/request-otp')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Pedir OTP por email para iniciar ativação 2FA' })
  async requestTwoFactorEnableOtp(
    @CurrentUser() user: { userId: string },
  ): Promise<{ message: string }> {
    return this.authService.requestTwoFactorEnableOtp(user.userId);
  }

  @Post('me/2fa/verify-email')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Validar OTP do email e obter QR TOTP' })
  async verifyTwoFactorEmail(
    @CurrentUser() user: { userId: string },
    @Body() dto: TwoFactorVerifyEmailDto,
  ): Promise<{ otpauthUrl: string; qrDataUrl: string; manualSecret: string }> {
    return this.authService.verifyTwoFactorEmailAndPrepareQr(user.userId, dto);
  }

  @Post('me/2fa/confirm')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Confirmar primeiro código TOTP e ativar 2FA' })
  async confirmTwoFactorTotp(
    @CurrentUser() user: { userId: string },
    @Body() dto: TwoFactorConfirmTotpDto,
  ): Promise<AuthUserResponseDto> {
    return this.authService.confirmTwoFactorTotp(user.userId, dto);
  }

  @Post('me/2fa/disable')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Desativar 2FA (senha obrigatória se existir)' })
  async disableTwoFactor(
    @CurrentUser() user: { userId: string },
    @Body() dto: TwoFactorDisableDto,
  ): Promise<AuthUserResponseDto> {
    return this.authService.disableTwoFactor(user.userId, dto);
  }

  @Get('confirm-email')
  @SkipThrottle()
  @ApiOperation({
    summary: 'Confirmar email (link do correio); redireciona para deep link Tauri',
  })
  @ApiResponse({ status: 302, description: 'Redirect para app' })
  async confirmEmail(
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    const url = await this.authService.confirmEmail(token ?? '');
    res.redirect(302, url);
  }
}
