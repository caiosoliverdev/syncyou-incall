import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Query,
  ParseUUIDPipe,
  Patch,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ChatService } from './chat.service';
import { EnsureDirectDto } from './dto/ensure-direct.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { UpdateConversationPreferencesDto } from './dto/update-conversation-preferences.dto';
import {
  AddGroupMembersDto,
  SetGroupMemberRoleDto,
  UpdateGroupDto,
} from './dto/update-group.dto';

@ApiTags('chat')
@Controller('chat')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Post('conversations/direct')
  @ApiOperation({ summary: 'Obter ou criar conversa directa com um amigo' })
  async ensureDirect(
    @CurrentUser() user: { userId: string },
    @Body() dto: EnsureDirectDto,
  ) {
    return this.chatService.ensureDirectConversation(user.userId, dto.peerUserId);
  }

  @Post('conversations/group')
  @ApiOperation({ summary: 'Criar conversa em grupo (foto opcional; membros = amigos)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['name', 'memberUserIds'],
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        memberUserIds: {
          type: 'string',
          description: 'Array JSON de UUIDs dos amigos a incluir (mínimo 1).',
        },
        avatar: { type: 'string', format: 'binary', description: 'Opcional' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async createGroup(
    @CurrentUser() user: { userId: string },
    @Body('name') name: string,
    @Body('description') description: string | undefined,
    @Body('memberUserIds') memberUserIds: string,
    @UploadedFile() avatar?: Express.Multer.File,
  ) {
    return this.chatService.createGroupConversation(
      user.userId,
      {
        name,
        description,
        memberUserIds,
      },
      avatar,
    );
  }

  @Post('calls/group')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Criar uma ligação em grupo temporária a partir de uma conversa directa; cria também o chat do grupo da chamada',
  })
  async createGroupCall(
    @CurrentUser() user: { userId: string },
    @Body() body: { sourceConversationId?: string; inviteeUserIds?: string[] },
  ) {
    if (typeof body?.sourceConversationId !== 'string' || !Array.isArray(body?.inviteeUserIds)) {
      throw new BadRequestException('Payload inválido.');
    }
    return this.chatService.createGroupCallFromDirectConversation(
      user.userId,
      body.sourceConversationId,
      body.inviteeUserIds,
    );
  }

  @Post('calls/group/:id/invite')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Convidar mais pessoas para uma ligação em grupo temporária já em andamento',
  })
  async inviteToGroupCall(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { inviteeUserIds?: string[] },
  ) {
    if (!Array.isArray(body?.inviteeUserIds)) {
      throw new BadRequestException('Payload inválido.');
    }
    return this.chatService.inviteUsersToExistingGroupCall(
      user.userId,
      id,
      body.inviteeUserIds,
    );
  }

  @Get('conversations')
  @ApiOperation({
    summary:
      'Listar conversas (directas e grupos) por janela temporal (paginação ao carregar mais antigas)',
  })
  async listConversations(
    @CurrentUser() user: { userId: string },
    @Query('days') daysRaw?: string,
    @Query('cursorEnd') cursorEnd?: string,
  ) {
    const parsed = daysRaw != null ? Number.parseInt(String(daysRaw).trim(), 10) : 7;
    const days = Number.isFinite(parsed) ? parsed : 7;
    return this.chatService.listConversations(user.userId, {
      days,
      cursorEnd: cursorEnd?.trim() || undefined,
    });
  }

  @Get('calls/logs')
  @ApiOperation({ summary: 'Listar histórico de ligações directas e em grupo temporárias' })
  async listCallLogs(@CurrentUser() user: { userId: string }) {
    return this.chatService.listCallLogs(user.userId);
  }

  @Get('conversations/:id/members')
  @ApiOperation({ summary: 'Listar integrantes do grupo' })
  async listGroupMembers(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.listGroupMembers(user.userId, id);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Mensagens da conversa (respeita apagar para mim e bloqueio)' })
  async getMessages(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.getMessages(user.userId, id);
  }

  @Get('conversations/:id/media')
  @ApiOperation({
    summary:
      'Listar mídias da conversa por página (tab + cursor); índice persistido em conversation_media',
  })
  async listConversationMedia(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Query('tab') tabRaw?: string,
    @Query('limit') limitRaw?: string,
    @Query('cursorSentAt') cursorSentAt?: string,
    @Query('cursorMessageId') cursorMessageId?: string,
  ) {
    const tab =
      tabRaw === 'arquivos-audios' ? 'arquivos-audios' : 'fotos-videos';
    const parsed = limitRaw != null ? Number.parseInt(String(limitRaw).trim(), 10) : 20;
    const limit = Number.isFinite(parsed) ? parsed : 20;
    return this.chatService.listConversationMedia(user.userId, id, {
      tab,
      limit,
      cursorSentAt: cursorSentAt?.trim() || undefined,
      cursorMessageId: cursorMessageId?.trim() || undefined,
    });
  }

  @Post('conversations/:id/messages')
  @ApiOperation({ summary: 'Enviar mensagem' })
  async sendMessage(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ) {
    return this.chatService.sendMessage(user.userId, id, dto);
  }

  @Post('conversations/:id/voice-call-invite')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Notificar o outro participante de uma chamada de voz (conversa directa; evento Socket.IO `incoming_call`)',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean', example: true } },
    },
  })
  @ApiBadRequestResponse({ description: 'Conversa não é directa ou inválida' })
  @ApiForbiddenResponse({ description: 'Sem acesso ou bloqueio entre contactos' })
  @ApiNotFoundResponse({ description: 'Conversa não encontrada' })
  async voiceCallInvite(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.notifyDirectVoiceCallInvite(user.userId, id);
  }

  @Post('conversations/:id/voice-call-end-ring')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Fim do toque (cancelar quem liga, recusar quem recebe ou tempo esgotado); notifica o outro com Socket.IO `voice_call_ring_ended`',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean', example: true } },
    },
  })
  @ApiBadRequestResponse({ description: 'Conversa não é directa ou inválida' })
  @ApiForbiddenResponse({ description: 'Sem acesso ou bloqueio entre contactos' })
  async voiceCallEndRing(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.notifyPeerVoiceCallRingEnded(user.userId, id);
  }

  @Post('conversations/:id/voice-call-answer')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Quem recebe atende: notifica quem ligou para abrir a tela de ligação (Socket.IO `voice_call_answered`)',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean', example: true } },
    },
  })
  @ApiBadRequestResponse({ description: 'Conversa não é directa ou inválida' })
  @ApiForbiddenResponse({ description: 'Sem acesso ou bloqueio entre contactos' })
  async voiceCallAnswer(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.notifyCallerVoiceCallAnswered(user.userId, id);
  }

  @Post('conversations/:id/voice-call-end-session')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Encerrar a sessão de chamada na app (Socket.IO `voice_call_session_ended` para o outro participante)',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: { ok: { type: 'boolean', example: true } },
    },
  })
  @ApiBadRequestResponse({ description: 'Conversa não é directa ou inválida' })
  @ApiForbiddenResponse({ description: 'Sem acesso ou bloqueio entre contactos' })
  async voiceCallEndSession(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.notifyPeerVoiceCallSessionEnded(user.userId, id);
  }

  @Delete('conversations/:id/messages/:messageId')
  @ApiOperation({ summary: 'Apagar mensagem para todos (só remetente, direct)' })
  async deleteMessageForEveryone(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('messageId', ParseUUIDPipe) messageId: string,
  ) {
    return this.chatService.deleteMessageForEveryone(user.userId, id, messageId);
  }

  @Post('conversations/:id/clear-for-me')
  @ApiOperation({ summary: 'Apagar conversa só para mim (histórico oculto até nova mensagem)' })
  async clearForMe(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.chatService.clearConversationForMe(user.userId, id);
    return { ok: true };
  }

  @Post('conversations/:id/leave-group')
  @ApiOperation({ summary: 'Sair do grupo (a conversa deixa de aparecer para si)' })
  async leaveGroup(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.chatService.leaveGroupConversation(user.userId, id);
    return { ok: true };
  }

  @Patch('conversations/:id/group')
  @ApiOperation({ summary: 'Editar nome e descrição do grupo (admin ou moderador)' })
  async updateGroup(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.chatService.updateGroupDetails(user.userId, id, {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.description !== undefined
        ? {
            description:
              dto.description.trim() === '' ? null : dto.description.trim(),
          }
        : {}),
    });
  }

  @Post('conversations/:id/group/avatar')
  @ApiOperation({ summary: 'Alterar foto do grupo (admin ou moderador)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['avatar'],
      properties: { avatar: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('avatar', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async updateGroupAvatar(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() avatar: Express.Multer.File | undefined,
  ) {
    return this.chatService.updateGroupAvatar(user.userId, id, avatar);
  }

  @Post('conversations/:id/members')
  @ApiOperation({ summary: 'Adicionar amigos ao grupo (admin ou moderador)' })
  async addGroupMembers(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddGroupMembersDto,
  ) {
    await this.chatService.addGroupMembers(user.userId, id, dto.memberUserIds);
    return { ok: true };
  }

  @Delete('conversations/:id/members/:userId')
  @ApiOperation({ summary: 'Remover membro do grupo' })
  async removeGroupMember(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    await this.chatService.removeGroupMember(user.userId, id, userId);
    return { ok: true };
  }

  @Patch('conversations/:id/members/:userId/role')
  @ApiOperation({ summary: 'Promover a moderador ou remover função (só administrador)' })
  async setGroupMemberRole(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: SetGroupMemberRoleDto,
  ) {
    await this.chatService.setGroupMemberRole(user.userId, id, userId, dto.role);
    return { ok: true };
  }

  @Delete('conversations/:id/group')
  @ApiOperation({ summary: 'Apagar o grupo (só administrador)' })
  async deleteGroup(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.chatService.deleteGroup(user.userId, id);
    return { ok: true };
  }

  @Post('conversations/:id/read')
  @ApiOperation({ summary: 'Marcar mensagens como lidas até ao fim do histórico visível' })
  async markRead(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chatService.markConversationAsRead(user.userId, id);
  }

  @Patch('conversations/:id/preferences')
  @ApiOperation({ summary: 'Favoritar ou silenciar conversa (persistente)' })
  async updatePreferences(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateConversationPreferencesDto,
  ) {
    return this.chatService.updateConversationPreferences(user.userId, id, dto);
  }

  @Post('conversations/:id/attachments')
  @ApiOperation({ summary: 'Carregar anexo para a conversa (imagem, vídeo, áudio, PDF)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        videoTrimStartSec: {
          type: 'string',
          description: 'Início do corte (segundos). Enviar com videoTrimEndSec.',
        },
        videoTrimEndSec: {
          type: 'string',
          description: 'Fim do corte (segundos). O servidor aplica o corte com ffmpeg.',
        },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  async uploadAttachment(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body('videoTrimStartSec') videoTrimStartSec?: string,
    @Body('videoTrimEndSec') videoTrimEndSec?: string,
  ) {
    const startRaw = videoTrimStartSec != null ? String(videoTrimStartSec).trim() : '';
    const endRaw = videoTrimEndSec != null ? String(videoTrimEndSec).trim() : '';
    const hasStart = startRaw.length > 0;
    const hasEnd = endRaw.length > 0;
    if (hasStart !== hasEnd) {
      throw new BadRequestException('Envie videoTrimStartSec e videoTrimEndSec em conjunto.');
    }
    let trim: { startSec: number; endSec: number } | undefined;
    if (hasStart && hasEnd) {
      const startSec = Number(startRaw);
      const endSec = Number(endRaw);
      if (!Number.isFinite(startSec) || !Number.isFinite(endSec)) {
        throw new BadRequestException('Tempos de corte inválidos.');
      }
      trim = { startSec, endSec };
    }
    return this.chatService.saveChatAttachment(user.userId, id, file, trim);
  }

  @Post('conversations/:id/sticker-from-image')
  @ApiOperation({
    summary:
      'Criar figurinha WebP a partir de uma imagem (wa-sticker-formatter) e guardar como anexo da conversa',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async uploadStickerFromImage(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.chatService.saveStickerFromImage(user.userId, id, file);
  }

  @Post('conversations/:id/sticker-remove-background')
  @ApiOperation({
    summary:
      'Remover fundo da imagem (@imgly/background-removal-node); devolve PNG com transparência',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async removeStickerBackground(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<StreamableFile> {
    const buf = await this.chatService.removeStickerImageBackground(
      user.userId,
      id,
      file,
    );
    return new StreamableFile(buf, {
      type: 'image/png',
      disposition: 'inline; filename="sticker-nobg.png"',
    });
  }
}
