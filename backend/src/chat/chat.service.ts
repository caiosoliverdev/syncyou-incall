import { existsSync, mkdirSync, unlinkSync } from 'fs';
import { writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { tmpdir } from 'os';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';
import type { Express } from 'express';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { SessionRegistryService } from '../auth/session/session-registry.service';
import { MediasoupRoomService } from '../mediasoup/mediasoup-room.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Friendship } from '../contacts/entities/friendship.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CallLog } from './entities/call-log.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { Conversation } from './entities/conversation.entity';
import { ConversationMedia } from './entities/conversation-media.entity';
import { Message } from './entities/message.entity';
import type { SendMessageDto } from './dto/send-message.dto';
import type { UpdateConversationPreferencesDto } from './dto/update-conversation-preferences.dto';
import { CreateGroupDto } from './dto/create-group.dto';
import {
  CHAT_VIDEO_MIN_TRIM_SEC,
  clampTrimRange,
  extractMiddleFrameJpeg,
  isFullRangeTrim,
  probeVideoDurationSec,
  trimVideoFileToMp4,
} from './chat-video-trim';
import { removeBackground } from '@imgly/background-removal-node';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';

export type ConversationListItemDirectDto = {
  id: string;
  kind: 'direct';
  peerUserId: string;
  peerName: string;
  peerAvatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageType: string;
  unreadCount: number;
  favorite: boolean;
  muted: boolean;
  /** Amizade em estado bloqueado (nenhum dos dois pode enviar mensagens). */
  friendshipBlocked: boolean;
  /** Se `friendshipBlocked`, true = eu bloqueei o outro; false = o outro bloqueou-me. */
  blockedByMe: boolean;
};

export type ConversationListItemGroupDto = {
  id: string;
  kind: 'group';
  groupSubtype?: 'channel' | 'call' | null;
  title: string;
  description: string | null;
  avatarUrl: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastMessageType: string;
  /** Nome a mostrar antes da pré-visualização (ex.: «João: olá»). */
  lastMessageSenderName: string | null;
  unreadCount: number;
  favorite: boolean;
  muted: boolean;
  /** Há mensagem não lida que menciona o utilizador (@[meuId](...)). */
  hasUnreadMention: boolean;
  /** Id da mensagem não lida mais recente que menciona o utilizador (para saltar no chat). */
  unreadMentionMessageId: string | null;
};

export type ConversationListItemDto =
  | ConversationListItemDirectDto
  | ConversationListItemGroupDto;

export type MessageResponseDto = {
  id: string;
  conversationId: string;
  senderId: string;
  sentAt: string;
  kind: string;
  text: string | null;
  payload: Record<string, unknown> | null;
  /** Só no histórico do destinatário quando o remetente apagou para todos. */
  deletedForEveryone?: boolean;
  /** Grupo: nome e foto do remetente para a UI. */
  senderName?: string | null;
  senderAvatarUrl?: string | null;
};

export type MessagesPageDto = {
  messages: MessageResponseDto[];
  peerLastReadAt: string | null;
};

export type GroupMemberDto = {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: 'admin' | 'moderator' | 'member';
  joinedAt: string;
  callStatus?: 'active' | 'left' | 'invited' | 'participated' | 'missed';
};

export type GroupAudioRoomParticipantDto = {
  userId: string;
  displayName: string;
  role: 'admin' | 'moderator' | 'member';
  avatarUrl: string | null;
};

export type CallLogListItemDto = {
  id: string;
  callType: 'direct' | 'group';
  conversationId: string;
  conversationKind: 'direct' | 'group';
  conversationGroupSubtype: 'channel' | 'call' | null;
  title: string;
  avatarUrl: string | null;
  peerUserId: string | null;
  status: 'ringing' | 'ongoing' | 'missed' | 'completed';
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
  missedAt: string | null;
  durationSeconds: number | null;
};

export type CallConferenceParticipantDto = {
  userId: string;
  displayName: string;
  role: 'admin' | 'moderator' | 'member';
  avatarUrl: string | null;
};

export type ConversationMediaPageItemDto =
  | {
      kind: 'image';
      id: string;
      messageId: string;
      sentAt: string;
      path: string;
      title: string | null;
    }
  | {
      kind: 'video';
      id: string;
      messageId: string;
      sentAt: string;
      path: string;
      posterPath: string | null;
      title: string | null;
    }
  | {
      kind: 'document';
      id: string;
      messageId: string;
      sentAt: string;
      path: string;
      fileName: string;
    }
  | {
      kind: 'audio';
      id: string;
      messageId: string;
      sentAt: string;
      path: string;
      title: string | null;
    };

export type ConversationMediaPageDto = {
  items: ConversationMediaPageItemDto[];
  nextCursor: { sentAt: string; messageId: string } | null;
  hasMore: boolean;
};

@Injectable()
export class ChatService {
  /** Evita revarrer mensagens antigas em cada pedido à mesma conversa (até reinício). */
  private readonly conversationMediaBackfilledIds = new Set<string>();

  constructor(
    @InjectRepository(Conversation)
    private readonly convRepo: Repository<Conversation>,
    @InjectRepository(CallLog)
    private readonly callLogRepo: Repository<CallLog>,
    @InjectRepository(ConversationParticipant)
    private readonly partRepo: Repository<ConversationParticipant>,
    @InjectRepository(ConversationMedia)
    private readonly conversationMediaRepo: Repository<ConversationMedia>,
    @InjectRepository(Message)
    private readonly msgRepo: Repository<Message>,
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly notificationsService: NotificationsService,
    @Inject(forwardRef(() => MediasoupRoomService))
    private readonly mediasoupRoom: MediasoupRoomService,
  ) {}

  private get filesBase(): string {
    return this.config
      .getOrThrow<{ baseUrl: string }>('app')
      .baseUrl.replace(/\/$/, '');
  }

  private avatarUrlFor(user: User): string | null {
    return user.avatarUrl ? `${this.filesBase}/api/v1/files/${user.avatarUrl}` : null;
  }

  private groupAvatarPublicUrl(avatarPath: string | null): string | null {
    return avatarPath ? `${this.filesBase}/api/v1/files/${avatarPath}` : null;
  }

  private normalizeGroupSubtype(
    value: string | null | undefined,
  ): 'channel' | 'call' | null {
    if (value === 'channel' || value === 'call') return value;
    return null;
  }

  private getConversationGroupSubtype(
    conv: Conversation | null | undefined,
  ): 'channel' | 'call' | null {
    return this.normalizeGroupSubtype(conv?.groupSubtype);
  }

  private async buildGroupConversationListItem(
    meId: string,
    conv: Conversation,
    part: ConversationParticipant,
  ): Promise<ConversationListItemGroupDto | null> {
    const cleared = part.clearedHistoryAt;
    const recent = await this.msgRepo.find({
      where: { conversationId: part.conversationId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    let lastMsg: Message | undefined;
    for (const m of recent) {
      if (cleared && m.createdAt <= cleared) {
        continue;
      }
      if (m.deletedForEveryoneAt && m.senderId === meId) {
        continue;
      }
      lastMsg = m;
      break;
    }

    if (!lastMsg && cleared) {
      return null;
    }

    const preview = this.previewFromMessage(lastMsg ?? null);
    const unreadCount = await this.countUnreadFromOthersInGroup(
      meId,
      part.conversationId,
      part,
    );
    const unreadMentionMessageId = await this.findLatestUnreadGroupMentionMessageId(
      meId,
      part.conversationId,
      part,
    );

    let lastMessageSenderName: string | null = null;
    if (lastMsg) {
      const lastSender = await this.usersService.findActiveById(lastMsg.senderId);
      if (lastSender) {
        lastMessageSenderName =
          lastMsg.senderId === meId ? 'Você' : this.senderProfileForDto(lastSender).name;
      }
    }

    return {
      id: part.conversationId,
      kind: 'group',
      groupSubtype: this.getConversationGroupSubtype(conv),
      title: conv.title ?? 'Grupo',
      description: conv.description,
      avatarUrl: this.groupAvatarPublicUrl(conv.avatarPath),
      lastMessageAt: lastMsg ? lastMsg.createdAt.toISOString() : conv.createdAt.toISOString(),
      lastMessagePreview: lastMsg ? preview.text : 'Grupo criado',
      lastMessageType: preview.type,
      lastMessageSenderName,
      unreadCount,
      favorite: part.favorite,
      muted: part.muted,
      hasUnreadMention: unreadMentionMessageId != null,
      unreadMentionMessageId,
    };
  }

  private async emitConversationCreatedToUser(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    const part = await this.partRepo.findOne({ where: { conversationId, userId } });
    if (!conv || !part || conv.type !== 'group') {
      return;
    }
    const item = await this.buildGroupConversationListItem(userId, conv, part);
    if (!item) {
      return;
    }
    this.sessionRegistry.emitToUser(userId, 'chat_conversation_created', {
      conversation: item as ConversationListItemDto,
    });
  }

  private async createCallLog(params: {
    conversationId: string;
    callType: 'direct' | 'group';
    initiatedByUserId: string;
    participantUserIds: string[];
    joinedUserIds?: string[];
    activeUserIds?: string[];
    status: 'ringing' | 'ongoing' | 'missed' | 'completed';
    answeredAt?: Date | null;
  }): Promise<CallLog> {
    const row = this.callLogRepo.create({
      conversationId: params.conversationId,
      callType: params.callType,
      initiatedByUserId: params.initiatedByUserId,
      participantUserIds: [...new Set(params.participantUserIds)],
      joinedUserIds: [...new Set(params.joinedUserIds ?? [])],
      activeUserIds: [...new Set(params.activeUserIds ?? [])],
      status: params.status,
      answeredAt: params.answeredAt ?? null,
      endedAt: null,
      missedAt: null,
      durationSeconds: null,
    });
    return await this.callLogRepo.save(row);
  }

  private async findLatestCallLog(
    conversationId: string,
    statuses?: Array<'ringing' | 'ongoing' | 'missed' | 'completed'>,
  ): Promise<CallLog | null> {
    const where = statuses?.length
      ? ({ conversationId, status: In(statuses) } as const)
      : ({ conversationId } as const);
    return await this.callLogRepo.findOne({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  private computeCallDurationSeconds(answeredAt: Date | null, endedAt: Date): number {
    if (!answeredAt) return 0;
    return Math.max(0, Math.round((endedAt.getTime() - answeredAt.getTime()) / 1000));
  }

  private resolveGroupCallMemberStatus(
    log: CallLog | null,
    userId: string,
  ): GroupMemberDto['callStatus'] {
    if (!log || log.callType !== 'group') return undefined;
    const joined = (log.joinedUserIds ?? []).includes(userId);
    const active = (log.activeUserIds ?? []).includes(userId);
    if (log.status === 'ongoing') {
      if (active) return 'active';
      if (joined) return 'left';
      return 'invited';
    }
    if (joined) return 'participated';
    return 'missed';
  }

  private async markLatestCallLogAnswered(conversationId: string): Promise<void> {
    const row = await this.findLatestCallLog(conversationId, ['ringing']);
    if (!row) return;
    row.status = 'ongoing';
    row.answeredAt = new Date();
    row.missedAt = null;
    row.joinedUserIds = [...new Set(row.participantUserIds)];
    row.activeUserIds = [...new Set(row.participantUserIds)];
    await this.callLogRepo.save(row);
  }

  async markLatestCallLogMissed(conversationId: string): Promise<void> {
    const row = await this.findLatestCallLog(conversationId, ['ringing']);
    if (!row) return;
    const now = new Date();
    row.status = 'missed';
    row.missedAt = now;
    row.endedAt = now;
    row.durationSeconds = 0;
    await this.callLogRepo.save(row);
  }

  async markLatestCallLogCompleted(conversationId: string): Promise<void> {
    const row = await this.findLatestCallLog(conversationId, ['ongoing']);
    if (!row) return;
    const now = new Date();
    row.status = 'completed';
    row.endedAt = now;
    row.activeUserIds = [];
    row.durationSeconds = this.computeCallDurationSeconds(row.answeredAt, now);
    await this.callLogRepo.save(row);
  }

  async markGroupCallParticipantJoined(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const row = await this.findLatestCallLog(conversationId, ['ongoing']);
    if (!row || row.callType !== 'group') return;
    row.joinedUserIds = [...new Set([...(row.joinedUserIds ?? []), userId])];
    row.activeUserIds = [...new Set([...(row.activeUserIds ?? []), userId])];
    await this.callLogRepo.save(row);
  }

  async markGroupCallParticipantLeft(
    conversationId: string,
    userId: string,
  ): Promise<void> {
    const row = await this.findLatestCallLog(conversationId, ['ongoing']);
    if (!row || row.callType !== 'group') return;
    row.activeUserIds = (row.activeUserIds ?? []).filter((id) => id !== userId);
    row.joinedUserIds = [...new Set([...(row.joinedUserIds ?? []), userId])];
    await this.callLogRepo.save(row);
  }

  private async saveGroupAvatarFile(
    file: Express.Multer.File,
  ): Promise<string> {
    const mime = (file.mimetype ?? '').toLowerCase();
    if (
      !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(mime)
    ) {
      throw new BadRequestException(
        'Use JPEG, PNG, WebP ou GIF para a foto do grupo.',
      );
    }
    const ext =
      mime === 'image/jpeg' ? 'jpg' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'gif';
    const id = uuidv7();
    const relative = `group-avatars/${id}.${ext}`;
    const uploadsRoot = join(process.cwd(), 'data', 'uploads');
    const fullPath = join(uploadsRoot, relative);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await writeFile(fullPath, file.buffer);
    return relative.replace(/\\/g, '/');
  }

  private async findFriendship(
    a: string,
    b: string,
  ): Promise<Friendship | null> {
    return this.friendshipRepo.findOne({
      where: [
        { requesterId: a, addresseeId: b },
        { requesterId: b, addresseeId: a },
      ],
    });
  }

  private assertFriendshipAllowsMessaging(friendship: Friendship | null): void {
    if (friendship?.status === 'blocked') {
      throw new ForbiddenException(
        'Não pode enviar mensagens enquanto existir bloqueio entre si e este contacto.',
      );
    }
  }

  /** Mensagens entre bloqueados: ninguém vê o que o outro envia (exceto o próprio remetente). */
  private shouldHideIncoming(
    viewerId: string,
    senderId: string,
    f: Friendship,
  ): boolean {
    if (f.status !== 'blocked' || senderId === viewerId) {
      return false;
    }
    const blocker = f.blockedByUserId!;
    const blockedPeer =
      f.requesterId === blocker ? f.addresseeId : f.requesterId;
    if (viewerId === blocker && senderId === blockedPeer) {
      return true;
    }
    if (viewerId === blockedPeer && senderId === blocker) {
      return true;
    }
    return false;
  }

  async findDirectConversation(
    userA: string,
    userB: string,
  ): Promise<Conversation | null> {
    const mine = await this.partRepo.find({ where: { userId: userA } });
    for (const pa of mine) {
      const peerPart = await this.partRepo.findOne({
        where: { conversationId: pa.conversationId, userId: userB },
      });
      if (!peerPart) {
        continue;
      }
      const c = await this.convRepo.findOne({
        where: { id: pa.conversationId, type: 'direct' },
      });
      if (!c) {
        continue;
      }
      const cnt = await this.partRepo.count({
        where: { conversationId: c.id },
      });
      if (cnt === 2) {
        return c;
      }
    }
    return null;
  }

  async ensureDirectConversation(
    meId: string,
    peerUserId: string,
  ): Promise<{ conversationId: string; peer: { id: string; firstName: string; lastName: string; avatarUrl: string | null } }> {
    if (peerUserId === meId) {
      throw new BadRequestException('Não pode conversar consigo mesmo.');
    }
    const peer = await this.usersService.findActiveById(peerUserId);
    if (!peer) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    const f = await this.findFriendship(meId, peerUserId);
    if (!f || f.status !== 'accepted') {
      throw new ForbiddenException(
        'Só pode iniciar conversa com um amigo (pedido aceite).',
      );
    }

    let conv = await this.findDirectConversation(meId, peerUserId);
    if (!conv) {
      conv = this.convRepo.create({ type: 'direct' });
      await this.convRepo.save(conv);
      await this.partRepo.save(
        this.partRepo.create({
          conversationId: conv.id,
          userId: meId,
          clearedHistoryAt: null,
          favorite: false,
          muted: false,
        }),
      );
      await this.partRepo.save(
        this.partRepo.create({
          conversationId: conv.id,
          userId: peerUserId,
          clearedHistoryAt: null,
          favorite: false,
          muted: false,
        }),
      );
    }

    return {
      conversationId: conv.id,
      peer: {
        id: peer.id,
        firstName: peer.firstName,
        lastName: peer.lastName,
        avatarUrl: this.avatarUrlFor(peer),
      },
    };
  }

  async createGroupConversation(
    meId: string,
    raw: {
      name?: string;
      description?: string;
      memberUserIds?: string | string[];
    },
    avatarFile?: Express.Multer.File,
  ): Promise<{
    conversationId: string;
    title: string;
    description: string | null;
    avatarUrl: string | null;
  }> {
    let memberIdsParsed: unknown = raw.memberUserIds;
    if (typeof memberIdsParsed === 'string') {
      try {
        memberIdsParsed = JSON.parse(memberIdsParsed) as unknown;
      } catch {
        throw new BadRequestException('memberUserIds inválido.');
      }
    }
    const dto = plainToInstance(CreateGroupDto, {
      name: typeof raw.name === 'string' ? raw.name : '',
      description:
        typeof raw.description === 'string' && raw.description.trim()
          ? raw.description.trim()
          : undefined,
      memberUserIds: Array.isArray(memberIdsParsed) ? memberIdsParsed : [],
    });
    const errs = validateSync(dto, {
      whitelist: true,
      forbidUnknownValues: false,
    });
    if (errs.length > 0) {
      throw new BadRequestException(
        'Indique um nome e pelo menos um amigo para o grupo.',
      );
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('Indique o nome do grupo.');
    }

    const uniqueMembers = [...new Set(dto.memberUserIds)];
    if (uniqueMembers.includes(meId)) {
      throw new BadRequestException(
        'Não inclua o seu próprio utilizador em memberUserIds.',
      );
    }

    for (const uid of uniqueMembers) {
      const peer = await this.usersService.findActiveById(uid);
      if (!peer) {
        throw new NotFoundException('Um dos membros indicados não existe.');
      }
      const f = await this.findFriendship(meId, uid);
      if (!f || f.status !== 'accepted') {
        throw new ForbiddenException(
          'Só pode adicionar amigos com pedido aceite ao grupo.',
        );
      }
    }

    let avatarPath: string | null = null;
    if (avatarFile?.buffer?.length) {
      avatarPath = await this.saveGroupAvatarFile(avatarFile);
    }

    const conv = this.convRepo.create({
      type: 'group',
      groupSubtype: 'channel',
      title: name,
      description: dto.description?.trim() ? dto.description.trim() : null,
      avatarPath,
    });
    await this.convRepo.save(conv);

    const basePart = {
      conversationId: conv.id,
      clearedHistoryAt: null,
      favorite: false,
      muted: false,
    };
    await this.partRepo.save(
      this.partRepo.create({
        ...basePart,
        userId: meId,
        groupRole: 'admin',
      }),
    );
    for (const uid of uniqueMembers) {
      await this.partRepo.save(
        this.partRepo.create({
          ...basePart,
          userId: uid,
          groupRole: 'member',
        }),
      );
    }

    await this.emitConversationCreatedToUser(meId, conv.id);
    for (const uid of uniqueMembers) {
      await this.emitConversationCreatedToUser(uid, conv.id);
    }

    return {
      conversationId: conv.id,
      title: name,
      description: conv.description,
      avatarUrl: this.groupAvatarPublicUrl(conv.avatarPath),
    };
  }

  private async buildCallConferenceParticipant(
    meId: string,
    conversationId: string,
  ): Promise<CallConferenceParticipantDto> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.type !== 'group' || this.getConversationGroupSubtype(conv) !== 'call') {
      throw new NotFoundException('Ligação em grupo não encontrada.');
    }
    const parts = await this.partRepo.find({
      where: { conversationId },
      order: { joinedAt: 'ASC' },
    });
    const user = await this.usersService.findActiveById(meId);
    const displayName = user
      ? `${user.firstName} ${user.lastName}`.trim() || user.email
      : 'Utilizador';
    return {
      userId: meId,
      displayName,
      role: this.getEffectiveGroupRole(part, parts),
      avatarUrl: user ? this.avatarUrlFor(user) : null,
    };
  }

  async getCallConferenceParticipant(
    meId: string,
    conversationId: string,
  ): Promise<CallConferenceParticipantDto> {
    return await this.buildCallConferenceParticipant(meId, conversationId);
  }

  async createGroupCallFromDirectConversation(
    meId: string,
    sourceConversationId: string,
    inviteeUserIds: string[],
  ): Promise<{
    ok: true;
    conversationId: string;
    title: string;
    avatarUrl: string | null;
  }> {
    const part = await this.getParticipant(sourceConversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const sourceConv = await this.convRepo.findOne({ where: { id: sourceConversationId } });
    if (!sourceConv || sourceConv.type !== 'direct') {
      throw new BadRequestException('A ligação em grupo deve nascer de uma conversa directa.');
    }
    const sourceParts = await this.partRepo.find({ where: { conversationId: sourceConversationId } });
    const directPeerId = sourceParts.find((item) => item.userId !== meId)?.userId;
    if (!directPeerId) {
      throw new BadRequestException('Conversa directa inválida.');
    }
    const directFriendship = await this.findFriendship(meId, directPeerId);
    if (!directFriendship || directFriendship.status !== 'accepted') {
      throw new ForbiddenException('Só pode ligar para amigos.');
    }
    this.assertFriendshipAllowsMessaging(directFriendship);

    const extraInvitees = [...new Set(inviteeUserIds)].filter((userId) => userId !== meId);
    const participantIds = [...new Set([directPeerId, ...extraInvitees])];
    if (participantIds.length === 0) {
      throw new BadRequestException('Escolha pelo menos uma pessoa para adicionar.');
    }

    const caller = await this.usersService.findActiveById(meId);
    if (!caller) {
      throw new ForbiddenException();
    }

    for (const uid of participantIds) {
      const peer = await this.usersService.findActiveById(uid);
      if (!peer) {
        throw new NotFoundException('Um dos utilizadores não existe.');
      }
      const friendship = await this.findFriendship(meId, uid);
      if (!friendship || friendship.status !== 'accepted') {
        throw new ForbiddenException('Só pode adicionar amigos a uma ligação em grupo.');
      }
      this.assertFriendshipAllowsMessaging(friendship);
    }

    const title = `Ligação com ${participantIds.length + 1} pessoas`;
    const conv = this.convRepo.create({
      type: 'group',
      groupSubtype: 'call',
      title,
      description: 'Chat da ligação em grupo',
      avatarPath: null,
    });
    await this.convRepo.save(conv);

    const basePart = {
      conversationId: conv.id,
      clearedHistoryAt: null,
      favorite: false,
      muted: false,
    };
    await this.partRepo.save(
      this.partRepo.create({
        ...basePart,
        userId: meId,
        groupRole: 'admin',
      }),
    );
    for (const uid of participantIds) {
      await this.partRepo.save(
        this.partRepo.create({
          ...basePart,
          userId: uid,
          groupRole: 'member',
        }),
      );
    }

    await this.createCallLog({
      conversationId: conv.id,
      callType: 'group',
      initiatedByUserId: meId,
      participantUserIds: [meId, ...participantIds],
      joinedUserIds: [meId],
      activeUserIds: [meId],
      status: 'ongoing',
      answeredAt: new Date(),
    });

    await this.emitConversationCreatedToUser(meId, conv.id);
    for (const uid of participantIds) {
      await this.emitConversationCreatedToUser(uid, conv.id);
    }

    const callerName =
      `${caller.firstName} ${caller.lastName}`.trim() || 'Contacto';
    const callerAvatarUrl = this.avatarUrlFor(caller);
    for (const uid of participantIds) {
      this.sessionRegistry.emitToUser(uid, 'incoming_call', {
        callerUserId: meId,
        callerName,
        callerAvatarUrl,
        conversationId: conv.id,
        conversationKind: 'group' as const,
        callSessionType: 'group_call' as const,
      });
    }

    return {
      ok: true as const,
      conversationId: conv.id,
      title,
      avatarUrl: null,
    };
  }

  async inviteUsersToExistingGroupCall(
    meId: string,
    conversationId: string,
    inviteeUserIds: string[],
  ): Promise<{ ok: true }> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.type !== 'group' || this.getConversationGroupSubtype(conv) !== 'call') {
      throw new NotFoundException('Ligação em grupo não encontrada.');
    }
    const myPart = await this.getParticipant(conversationId, meId);
    if (!myPart) {
      throw new ForbiddenException('Sem acesso a esta ligação em grupo.');
    }
    const uniqueInvitees = [...new Set(inviteeUserIds)].filter((userId) => userId !== meId);
    if (uniqueInvitees.length === 0) {
      throw new BadRequestException('Nenhum participante novo foi selecionado.');
    }

    const existingParts = await this.partRepo.find({ where: { conversationId } });
    const existingIds = new Set(existingParts.map((item) => item.userId));
    const caller = await this.usersService.findActiveById(meId);
    if (!caller) {
      throw new ForbiddenException();
    }
    const callerName =
      `${caller.firstName} ${caller.lastName}`.trim() || 'Contacto';
    const callerAvatarUrl = this.avatarUrlFor(caller);

    for (const uid of uniqueInvitees) {
      if (existingIds.has(uid)) {
        continue;
      }
      const peer = await this.usersService.findActiveById(uid);
      if (!peer) {
        throw new NotFoundException('Um dos utilizadores não existe.');
      }
      const friendship = await this.findFriendship(meId, uid);
      if (!friendship || friendship.status !== 'accepted') {
        throw new ForbiddenException('Só pode adicionar amigos a uma ligação em grupo.');
      }
      this.assertFriendshipAllowsMessaging(friendship);
      await this.partRepo.save(
        this.partRepo.create({
          conversationId,
          userId: uid,
          clearedHistoryAt: null,
          favorite: false,
          muted: false,
          groupRole: 'member',
        }),
      );
      await this.emitConversationCreatedToUser(uid, conversationId);
      this.sessionRegistry.emitToUser(uid, 'incoming_call', {
        callerUserId: meId,
        callerName,
        callerAvatarUrl,
        conversationId,
        conversationKind: 'group' as const,
        callSessionType: 'group_call' as const,
      });
    }

    const latest = await this.findLatestCallLog(conversationId, ['ongoing']);
    if (latest) {
      latest.participantUserIds = [...new Set([...latest.participantUserIds, ...uniqueInvitees])];
      await this.callLogRepo.save(latest);
    }
    return { ok: true as const };
  }

  async listCallLogs(meId: string): Promise<{ calls: CallLogListItemDto[] }> {
    const parts = await this.partRepo.find({ where: { userId: meId } });
    const conversationIds = [...new Set(parts.map((part) => part.conversationId))];
    if (conversationIds.length === 0) {
      return { calls: [] };
    }
    const logs = await this.callLogRepo.find({
      where: { conversationId: In(conversationIds) },
      order: { createdAt: 'DESC' },
      take: 200,
    });
    if (logs.length === 0) {
      return { calls: [] };
    }

    const convIds = [...new Set(logs.map((row) => row.conversationId))];
    const convs = await this.convRepo.find({ where: { id: In(convIds) } });
    const convById = new Map(convs.map((conv) => [conv.id, conv]));
    const convParts = await this.partRepo.find({ where: { conversationId: In(convIds) } });
    const partsByConversationId = new Map<string, ConversationParticipant[]>();
    for (const part of convParts) {
      const list = partsByConversationId.get(part.conversationId) ?? [];
      list.push(part);
      partsByConversationId.set(part.conversationId, list);
    }

    const directPeerIds = new Set<string>();
    for (const row of logs) {
      const conv = convById.get(row.conversationId);
      if (!conv || conv.type !== 'direct') continue;
      const peerId =
        partsByConversationId
          .get(row.conversationId)
          ?.find((part) => part.userId !== meId)?.userId ?? null;
      if (peerId) {
        directPeerIds.add(peerId);
      }
    }
    const directPeers = await this.usersService.findActiveByIds([...directPeerIds]);
    const directPeerById = new Map(directPeers.map((peer) => [peer.id, peer]));

    const calls: CallLogListItemDto[] = [];
    for (const row of logs) {
      const conv = convById.get(row.conversationId);
      if (!conv) continue;
      if (conv.type === 'group' && this.getConversationGroupSubtype(conv) !== 'call') {
        continue;
      }
      if (conv.type === 'direct') {
        const peerId =
          partsByConversationId
            .get(row.conversationId)
            ?.find((part) => part.userId !== meId)?.userId ?? null;
        const peer = peerId ? directPeerById.get(peerId) ?? null : null;
        calls.push({
          id: row.id,
          callType: row.callType,
          conversationId: row.conversationId,
          conversationKind: 'direct',
          conversationGroupSubtype: null,
          title: peer ? `${peer.firstName} ${peer.lastName}`.trim() || peer.email : 'Ligação',
          avatarUrl: peer ? this.avatarUrlFor(peer) : null,
          peerUserId: peerId,
          status: row.status,
          startedAt: row.createdAt.toISOString(),
          answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
          endedAt: row.endedAt ? row.endedAt.toISOString() : null,
          missedAt: row.missedAt ? row.missedAt.toISOString() : null,
          durationSeconds: row.durationSeconds,
        });
        continue;
      }
      calls.push({
        id: row.id,
        callType: row.callType,
        conversationId: row.conversationId,
        conversationKind: 'group',
        conversationGroupSubtype: this.getConversationGroupSubtype(conv),
        title: conv.title ?? 'Ligação em grupo',
        avatarUrl: this.groupAvatarPublicUrl(conv.avatarPath),
        peerUserId: null,
        status: row.status,
        startedAt: row.createdAt.toISOString(),
        answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
        endedAt: row.endedAt ? row.endedAt.toISOString() : null,
        missedAt: row.missedAt ? row.missedAt.toISOString() : null,
        durationSeconds: row.durationSeconds,
      });
    }

    return { calls };
  }

  async listGroupMembers(
    meId: string,
    conversationId: string,
  ): Promise<{ members: GroupMemberDto[] }> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.type !== 'group') {
      throw new NotFoundException('Conversa não encontrada.');
    }
    const parts = await this.partRepo.find({
      where: { conversationId },
      order: { joinedAt: 'ASC' },
    });
    if (parts.length === 0) {
      return { members: [] };
    }
    const userIds = parts.map((p) => p.userId);
    const users = await this.usersService.findActiveByIds(userIds);
    const byId = new Map(users.map((u) => [u.id, u]));
    const callLog =
      this.getConversationGroupSubtype(conv) === 'call'
        ? await this.findLatestCallLog(conversationId)
        : null;
    const members: GroupMemberDto[] = parts.map((p) => {
      const u = byId.get(p.userId);
      const displayName = u
        ? `${u.firstName} ${u.lastName}`.trim() || u.email
        : 'Utilizador';
      return {
        userId: p.userId,
        displayName,
        email: u?.email ?? '',
        avatarUrl: u ? this.avatarUrlFor(u) : null,
        role: this.getEffectiveGroupRole(p, parts),
        joinedAt: p.joinedAt.toISOString(),
        callStatus: this.resolveGroupCallMemberStatus(callLog, p.userId),
      };
    });
    return { members };
  }

  async getGroupAudioRoomParticipant(
    meId: string,
    conversationId: string,
  ): Promise<GroupAudioRoomParticipantDto> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.type !== 'group') {
      throw new NotFoundException('Conversa não encontrada.');
    }
    const parts = await this.partRepo.find({
      where: { conversationId },
      order: { joinedAt: 'ASC' },
    });
    const user = await this.usersService.findActiveById(meId);
    const displayName = user
      ? `${user.firstName} ${user.lastName}`.trim() || user.email
      : 'Utilizador';
    return {
      userId: meId,
      displayName,
      role: this.getEffectiveGroupRole(part, parts),
      avatarUrl: user ? this.avatarUrlFor(user) : null,
    };
  }

  private getEffectiveGroupRole(
    p: ConversationParticipant,
    parts: ConversationParticipant[],
  ): 'admin' | 'moderator' | 'member' {
    if (
      p.groupRole === 'admin' ||
      p.groupRole === 'moderator' ||
      p.groupRole === 'member'
    ) {
      return p.groupRole;
    }
    const sorted = [...parts].sort(
      (a, b) => a.joinedAt.getTime() - b.joinedAt.getTime(),
    );
    return sorted[0]?.userId === p.userId ? 'admin' : 'member';
  }

  private assertGroupConv(
    conv: Conversation | null,
  ): asserts conv is Conversation & { type: 'group' } {
    if (!conv || conv.type !== 'group') {
      throw new NotFoundException('Conversa de grupo não encontrada.');
    }
  }

  private async requireGroupManagement(
    meId: string,
    conversationId: string,
  ): Promise<{
    conv: Conversation & { type: 'group' };
    parts: ConversationParticipant[];
    myPart: ConversationParticipant;
    myRole: 'admin' | 'moderator' | 'member';
  }> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    this.assertGroupConv(conv);
    const parts = await this.partRepo.find({
      where: { conversationId },
      order: { joinedAt: 'ASC' },
    });
    const myPart = parts.find((x) => x.userId === meId);
    if (!myPart) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const myRole = this.getEffectiveGroupRole(myPart, parts);
    return { conv, parts, myPart, myRole };
  }

  async updateGroupDetails(
    meId: string,
    conversationId: string,
    dto: { name?: string; description?: string | null },
  ): Promise<{ title: string; description: string | null }> {
    const { conv, myRole } = await this.requireGroupManagement(meId, conversationId);
    if (myRole === 'member') {
      throw new ForbiddenException(
        'Apenas administradores ou moderadores podem editar o grupo.',
      );
    }
    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException('Indique um nome.');
      }
      conv.title = name;
    }
    if (dto.description !== undefined) {
      conv.description = dto.description?.trim() ? dto.description.trim() : null;
    }
    await this.convRepo.save(conv);
    return { title: conv.title ?? '', description: conv.description };
  }

  async updateGroupAvatar(
    meId: string,
    conversationId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{ avatarUrl: string | null }> {
    const { conv, myRole } = await this.requireGroupManagement(meId, conversationId);
    if (myRole === 'member') {
      throw new ForbiddenException(
        'Apenas administradores ou moderadores podem alterar a foto.',
      );
    }
    if (!file?.buffer?.length) {
      throw new BadRequestException('Ficheiro em falta.');
    }
    const avatarPath = await this.saveGroupAvatarFile(file);
    conv.avatarPath = avatarPath;
    await this.convRepo.save(conv);
    return { avatarUrl: this.groupAvatarPublicUrl(conv.avatarPath) };
  }

  async addGroupMembers(
    meId: string,
    conversationId: string,
    memberUserIds: string[],
  ): Promise<void> {
    const { myRole } = await this.requireGroupManagement(meId, conversationId);
    if (myRole === 'member') {
      throw new ForbiddenException('Sem permissão para adicionar membros.');
    }
    const unique = [...new Set(memberUserIds)].filter((id) => id !== meId);
    const existing = await this.partRepo.find({ where: { conversationId } });
    const existingIds = new Set(existing.map((p) => p.userId));
    for (const uid of unique) {
      if (existingIds.has(uid)) {
        continue;
      }
      const peer = await this.usersService.findActiveById(uid);
      if (!peer) {
        throw new NotFoundException('Um dos utilizadores não existe.');
      }
      const f = await this.findFriendship(meId, uid);
      if (!f || f.status !== 'accepted') {
        throw new ForbiddenException('Só pode adicionar amigos ao grupo.');
      }
      await this.partRepo.save(
        this.partRepo.create({
          conversationId,
          userId: uid,
          clearedHistoryAt: null,
          favorite: false,
          muted: false,
          groupRole: 'member',
        }),
      );
    }
  }

  async removeGroupMember(
    meId: string,
    conversationId: string,
    targetUserId: string,
  ): Promise<void> {
    if (targetUserId === meId) {
      throw new BadRequestException('Use «Sair do grupo» para sair.');
    }
    const { parts, myRole } = await this.requireGroupManagement(meId, conversationId);
    const targetPart = parts.find((x) => x.userId === targetUserId);
    if (!targetPart) {
      throw new NotFoundException('Membro não encontrado.');
    }
    const targetRole = this.getEffectiveGroupRole(targetPart, parts);
    if (targetRole === 'admin') {
      throw new ForbiddenException('O administrador do grupo não pode ser removido.');
    }
    if (myRole === 'member') {
      throw new ForbiddenException('Sem permissão.');
    }
    if (myRole === 'moderator' && targetRole !== 'member') {
      throw new ForbiddenException('Moderadores só podem remover membros.');
    }
    await this.partRepo.delete({ conversationId, userId: targetUserId });
  }

  async setGroupMemberRole(
    meId: string,
    conversationId: string,
    targetUserId: string,
    role: 'moderator' | 'member',
  ): Promise<void> {
    const { parts, myRole } = await this.requireGroupManagement(meId, conversationId);
    if (myRole !== 'admin') {
      throw new ForbiddenException('Apenas o administrador pode alterar funções.');
    }
    if (targetUserId === meId) {
      throw new BadRequestException('Não pode alterar a sua própria função assim.');
    }
    const targetPart = parts.find((x) => x.userId === targetUserId);
    if (!targetPart) {
      throw new NotFoundException('Membro não encontrado.');
    }
    const tr = this.getEffectiveGroupRole(targetPart, parts);
    if (tr === 'admin') {
      throw new BadRequestException('A função do administrador não pode ser alterada.');
    }
    if (role === 'moderator') {
      if (tr !== 'member') {
        throw new BadRequestException('Só pode promover membros a moderador.');
      }
    } else {
      if (tr !== 'moderator') {
        throw new BadRequestException(
          'Só pode remover o estatuto de moderador a um moderador.',
        );
      }
    }
    targetPart.groupRole = role;
    await this.partRepo.save(targetPart);
  }

  async deleteGroup(meId: string, conversationId: string): Promise<void> {
    const { conv, myRole } = await this.requireGroupManagement(meId, conversationId);
    if (myRole !== 'admin') {
      throw new ForbiddenException('Apenas o administrador pode apagar o grupo.');
    }
    await this.notificationsService.deleteChatNotificationsForConversation(
      conversationId,
    );
    await this.conversationMediaRepo.delete({ conversationId });
    await this.msgRepo
      .createQueryBuilder()
      .delete()
      .from(Message)
      .where('conversationId = :cid', { cid: conversationId })
      .execute();
    await this.partRepo
      .createQueryBuilder()
      .delete()
      .from(ConversationParticipant)
      .where('conversationId = :cid', { cid: conversationId })
      .execute();
    await this.convRepo.delete({ id: conv.id });
  }

  private async getParticipant(
    conversationId: string,
    userId: string,
  ): Promise<ConversationParticipant | null> {
    return this.partRepo.findOne({ where: { conversationId, userId } });
  }

  private extractRelativeStoragePath(url: unknown): string | null {
    if (typeof url !== 'string' || !url.trim()) {
      return null;
    }
    const u = url.trim();
    const markers = ['/api/v1/files/', '/files/'];
    for (const m of markers) {
      const i = u.indexOf(m);
      if (i >= 0) {
        const rest = u.slice(i + m.length).split('?')[0];
        const p = rest.replace(/^\/+/, '');
        return p.length ? p : null;
      }
    }
    if (!/^https?:\/\//i.test(u)) {
      const p = u.replace(/^\/+/, '').split('?')[0];
      return p.length ? p : null;
    }
    return null;
  }

  private displayTitleFromStoragePath(storagePath: string): string {
    const seg = storagePath.split('/').pop() ?? storagePath;
    return seg.replace(/^[\da-f-]{30,}_/i, '').replace(/^[0-9a-f-]{8}-[0-9a-f-]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}_/i, '') || seg;
  }

  private buildConversationMediaFromMessage(msg: Message): {
    conversationId: string;
    messageId: string;
    senderId: string;
    category: 'image' | 'video' | 'document' | 'audio';
    storagePath: string;
    posterPath: string | null;
    fileName: string | null;
    mimeType: string | null;
    sentAt: Date;
  } | null {
    if (msg.deletedForEveryoneAt) {
      return null;
    }
    const k = msg.kind;
    if (!['image', 'video', 'audio', 'document'].includes(k)) {
      return null;
    }
    const payload = msg.payload as Record<string, unknown> | null;
    const att = payload?.attachment as Record<string, unknown> | undefined;
    if (!att || typeof att !== 'object') {
      return null;
    }

    const sentAt = msg.createdAt;
    const base = {
      conversationId: msg.conversationId,
      messageId: msg.id,
      senderId: msg.senderId,
      sentAt,
    };

    if (k === 'image') {
      /** GIFs e figurinhas não entram na galeria de mídias. */
      if (att.asGif === true || att.asSticker === true) {
        return null;
      }
      const path = this.extractRelativeStoragePath(att.url);
      if (!path) {
        return null;
      }
      const fileName =
        typeof att.alt === 'string' && att.alt.trim()
          ? att.alt.trim().slice(0, 256)
          : null;
      return {
        ...base,
        category: 'image' as const,
        storagePath: path,
        posterPath: null,
        fileName,
        mimeType: null,
      };
    }
    if (k === 'video') {
      const path = this.extractRelativeStoragePath(att.url);
      if (!path) {
        return null;
      }
      const poster =
        att.posterUrl !== undefined && att.posterUrl !== null
          ? this.extractRelativeStoragePath(att.posterUrl)
          : null;
      return {
        ...base,
        category: 'video' as const,
        storagePath: path,
        posterPath: poster,
        fileName: null,
        mimeType: null,
      };
    }
    if (k === 'audio') {
      const path = this.extractRelativeStoragePath(att.url);
      if (!path) {
        return null;
      }
      return {
        ...base,
        category: 'audio' as const,
        storagePath: path,
        posterPath: null,
        fileName: null,
        mimeType: null,
      };
    }
    const path = this.extractRelativeStoragePath(att.url);
    if (!path) {
      return null;
    }
    const fileName =
      typeof att.fileName === 'string' && att.fileName.trim()
        ? att.fileName.trim().slice(0, 256)
        : this.displayTitleFromStoragePath(path);
    const mimeType =
      typeof att.mimeType === 'string' && att.mimeType.trim()
        ? att.mimeType.trim().slice(0, 128)
        : null;
    return {
      ...base,
      category: 'document' as const,
      storagePath: path,
      posterPath: null,
      fileName,
      mimeType,
    };
  }

  /**
   * Remove do índice linhas antigas que correspondam a GIF/figurinha (antes não filtrávamos).
   */
  private async pruneGifStickerMediaRows(conversationId: string): Promise<void> {
    const imgs = await this.msgRepo.find({
      where: { conversationId, kind: 'image' },
      select: ['id', 'payload'],
    });
    const ids = imgs
      .filter((m) => {
        const att = (
          m.payload as {
            attachment?: { asGif?: boolean; asSticker?: boolean };
          } | null
        )?.attachment;
        return att?.asGif === true || att?.asSticker === true;
      })
      .map((m) => m.id);
    if (ids.length === 0) {
      return;
    }
    await this.conversationMediaRepo.delete({ messageId: In(ids) });
  }

  private async upsertConversationMediaFromMessage(msg: Message): Promise<void> {
    const data = this.buildConversationMediaFromMessage(msg);
    if (!data) {
      return;
    }
    const exists = await this.conversationMediaRepo.exist({
      where: { messageId: msg.id },
    });
    if (exists) {
      return;
    }
    await this.conversationMediaRepo.save(
      this.conversationMediaRepo.create({ ...data, id: uuidv7() }),
    );
  }

  private async ensureConversationMediaBackfill(
    conversationId: string,
  ): Promise<void> {
    if (this.conversationMediaBackfilledIds.has(conversationId)) {
      return;
    }

    const existingRows = await this.conversationMediaRepo.find({
      where: { conversationId },
      select: { messageId: true },
    });
    const have = new Set(existingRows.map((r) => r.messageId));

    const candidates = await this.msgRepo.find({
      where: {
        conversationId,
        kind: In(['image', 'video', 'audio', 'document']),
        deletedForEveryoneAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    for (const m of candidates) {
      if (have.has(m.id)) {
        continue;
      }
      const data = this.buildConversationMediaFromMessage(m);
      if (!data) {
        continue;
      }
      try {
        await this.conversationMediaRepo.save(
          this.conversationMediaRepo.create({ ...data, id: uuidv7() }),
        );
        have.add(m.id);
      } catch {
        /* messageId único — corrida ou duplicado */
      }
    }

    this.conversationMediaBackfilledIds.add(conversationId);
  }

  private conversationMediaRowVisible(
    r: ConversationMedia,
    meId: string,
    conv: Conversation,
    cleared: Date | null,
    friendship: Friendship | null,
  ): boolean {
    if (cleared && r.sentAt <= cleared) {
      return false;
    }
    if (
      conv.type === 'direct' &&
      friendship &&
      this.shouldHideIncoming(meId, r.senderId, friendship)
    ) {
      return false;
    }
    return true;
  }

  private mapConversationMediaRowToDto(r: ConversationMedia): ConversationMediaPageItemDto {
    const sentAt = r.sentAt.toISOString();
    if (r.category === 'image') {
      return {
        kind: 'image',
        id: r.id,
        messageId: r.messageId,
        sentAt,
        path: r.storagePath,
        title: r.fileName ?? this.displayTitleFromStoragePath(r.storagePath),
      };
    }
    if (r.category === 'video') {
      return {
        kind: 'video',
        id: r.id,
        messageId: r.messageId,
        sentAt,
        path: r.storagePath,
        posterPath: r.posterPath,
        title: this.displayTitleFromStoragePath(r.storagePath),
      };
    }
    if (r.category === 'document') {
      return {
        kind: 'document',
        id: r.id,
        messageId: r.messageId,
        sentAt,
        path: r.storagePath,
        fileName: r.fileName ?? 'ficheiro',
      };
    }
    return {
      kind: 'audio',
      id: r.id,
      messageId: r.messageId,
      sentAt,
      path: r.storagePath,
      title: this.displayTitleFromStoragePath(r.storagePath),
    };
  }

  async listConversationMedia(
    meId: string,
    conversationId: string,
    opts: {
      tab: 'fotos-videos' | 'arquivos-audios';
      limit: number;
      cursorSentAt?: string;
      cursorMessageId?: string;
    },
  ): Promise<ConversationMediaPageDto> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerPart = allParts.find((x) => x.userId !== meId);
    const peerId = peerPart?.userId;
    const friendship =
      conv.type === 'direct' && peerId
        ? await this.findFriendship(meId, peerId)
        : null;

    await this.pruneGifStickerMediaRows(conversationId);
    await this.ensureConversationMediaBackfill(conversationId);

    const cleared = part.clearedHistoryAt;
    const cats =
      opts.tab === 'fotos-videos'
        ? (['image', 'video'] as const)
        : (['document', 'audio'] as const);

    const cts = opts.cursorSentAt?.trim();
    const cmid = opts.cursorMessageId?.trim();
    if ((cts && !cmid) || (!cts && cmid)) {
      throw new BadRequestException(
        'cursorSentAt e cursorMessageId são obrigatórios em conjunto.',
      );
    }
    const hasCursor = !!(cts && cmid);

    const limit = Math.min(50, Math.max(1, opts.limit));
    const take = limit + 1;

    let qb = this.conversationMediaRepo
      .createQueryBuilder('cm')
      .where('cm.conversationId = :cid', { cid: conversationId })
      .andWhere('cm.category IN (:...cats)', { cats: [...cats] });

    if (cleared) {
      qb = qb.andWhere('cm.sentAt > :cleared', { cleared });
    }

    if (hasCursor) {
      const cs = new Date(cts!);
      if (Number.isNaN(cs.getTime())) {
        throw new BadRequestException('cursorSentAt inválido.');
      }
      qb = qb.andWhere(
        '(cm.sentAt < :cs OR (cm.sentAt = :cs AND cm.messageId < :mid))',
        { cs, mid: cmid },
      );
    }

    const rows = await qb
      .orderBy('cm.sentAt', 'DESC')
      .addOrderBy('cm.messageId', 'DESC')
      .take(take)
      .getMany();

    const hasMore = rows.length > limit;
    const slice = hasMore ? rows.slice(0, limit) : rows;

    const items: ConversationMediaPageItemDto[] = [];
    for (const r of slice) {
      if (!this.conversationMediaRowVisible(r, meId, conv, cleared, friendship)) {
        continue;
      }
      items.push(this.mapConversationMediaRowToDto(r));
    }

    const lastRaw = slice[slice.length - 1];
    const nextCursor =
      hasMore && lastRaw
        ? {
            sentAt: lastRaw.sentAt.toISOString(),
            messageId: lastRaw.messageId,
          }
        : null;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  private async countUnreadFromPeer(
    meId: string,
    peerId: string,
    conversationId: string,
    myPart: ConversationParticipant,
    f: Friendship | null,
  ): Promise<number> {
    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.conversationId = :cid', { cid: conversationId })
      .andWhere('m.senderId = :peerId', { peerId });

    if (myPart.clearedHistoryAt) {
      qb.andWhere('m.createdAt > :cleared', { cleared: myPart.clearedHistoryAt });
    }
    if (myPart.lastReadAt) {
      qb.andWhere('m.createdAt > :lr', { lr: myPart.lastReadAt });
    }

    const raw = await qb.getMany();
    let c = 0;
    for (const m of raw) {
      if (f && this.shouldHideIncoming(meId, m.senderId, f)) {
        continue;
      }
      c++;
    }
    return c;
  }

  private async countUnreadFromOthersInGroup(
    meId: string,
    conversationId: string,
    myPart: ConversationParticipant,
  ): Promise<number> {
    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.conversationId = :cid', { cid: conversationId })
      .andWhere('m.senderId != :meId', { meId });

    if (myPart.clearedHistoryAt) {
      qb.andWhere('m.createdAt > :cleared', { cleared: myPart.clearedHistoryAt });
    }
    if (myPart.lastReadAt) {
      qb.andWhere('m.createdAt > :lr', { lr: myPart.lastReadAt });
    }

    const raw = await qb.getMany();
    let c = 0;
    for (const m of raw) {
      if (m.deletedForEveryoneAt && m.senderId === meId) {
        continue;
      }
      c++;
    }
    return c;
  }

  /**
   * Mensagem não lida mais recente (texto) que contém menção ao utilizador @[meId](
   */
  private async findLatestUnreadGroupMentionMessageId(
    meId: string,
    conversationId: string,
    myPart: ConversationParticipant,
  ): Promise<string | null> {
    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.conversationId = :cid', { cid: conversationId })
      .andWhere('m.senderId != :meId', { meId })
      .andWhere('m.kind = :tk', { tk: 'text' })
      .orderBy('m.createdAt', 'DESC');

    if (myPart.clearedHistoryAt) {
      qb.andWhere('m.createdAt > :cleared', { cleared: myPart.clearedHistoryAt });
    }
    if (myPart.lastReadAt) {
      qb.andWhere('m.createdAt > :lr', { lr: myPart.lastReadAt });
    }

    const candidates = await qb.getMany();
    const needle = `@[${meId}](`;
    /** Menção @todos no grupo — mesmo id que o cliente (`GROUP_ALL_MENTION_USER_ID`). */
    const needleAll = `@[__incall_group_all__](`;
    for (const m of candidates) {
      const t = m.text ?? '';
      if (t.includes(needle) || t.includes(needleAll)) {
        return m.id;
      }
    }
    return null;
  }

  /**
   * Mensagens visíveis para `meId` (bloqueio + apagar para mim).
   */
  private async fetchVisibleMessages(
    meId: string,
    conversationId: string,
  ): Promise<{
    messages: Message[];
    peerPart: ConversationParticipant | undefined;
    friendship: Friendship | null;
    myPart: ConversationParticipant;
    conv: Conversation;
  }> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerPart = allParts.find((x) => x.userId !== meId);
    const peerId = peerPart?.userId;
    const friendship =
      conv.type === 'direct' && peerId
        ? await this.findFriendship(meId, peerId)
        : null;

    const qb = this.msgRepo
      .createQueryBuilder('m')
      .where('m.conversationId = :cid', { cid: conversationId })
      .orderBy('m.createdAt', 'ASC');

    if (part.clearedHistoryAt) {
      qb.andWhere('m.createdAt > :cleared', { cleared: part.clearedHistoryAt });
    }

    const raw = await qb.getMany();
    const messages: Message[] = [];
    for (const m of raw) {
      if (
        conv.type === 'direct' &&
        friendship &&
        this.shouldHideIncoming(meId, m.senderId, friendship)
      ) {
        continue;
      }
      if (m.deletedForEveryoneAt && m.senderId === meId) {
        continue;
      }
      messages.push(m);
    }

    return { messages, peerPart, friendship, myPart: part, conv };
  }

  async listConversations(
    meId: string,
    opts?: { days?: number; cursorEnd?: string },
  ): Promise<{
    conversations: ConversationListItemDto[];
    nextCursorEnd: string | null;
    hasMore: boolean;
  }> {
    const parts = await this.partRepo.find({ where: { userId: meId } });
    const items: ConversationListItemDto[] = [];

    for (const p of parts) {
      const conv = await this.convRepo.findOne({ where: { id: p.conversationId } });
      if (!conv) {
        continue;
      }

      if (conv.type === 'direct') {
        const allParts = await this.partRepo.find({
          where: { conversationId: p.conversationId },
        });
        const peerPart = allParts.find((x) => x.userId !== meId);
        if (!peerPart) {
          continue;
        }
        const peer = await this.usersService.findActiveById(peerPart.userId);
        if (!peer) {
          continue;
        }

        const cleared = p.clearedHistoryAt;
        const f = await this.findFriendship(meId, peer.id);
        const recent = await this.msgRepo.find({
          where: { conversationId: p.conversationId },
          order: { createdAt: 'DESC' },
          take: 50,
        });
        let lastMsg: Message | undefined;
        for (const m of recent) {
          if (cleared && m.createdAt <= cleared) {
            continue;
          }
          if (f && this.shouldHideIncoming(meId, m.senderId, f)) {
            continue;
          }
          if (m.deletedForEveryoneAt && m.senderId === meId) {
            continue;
          }
          lastMsg = m;
          break;
        }

        if (!lastMsg && cleared) {
          continue;
        }

        const convRow = await this.convRepo.findOne({ where: { id: p.conversationId } });
        const preview = this.previewFromMessage(lastMsg ?? null);
        const unreadCount = await this.countUnreadFromPeer(
          meId,
          peer.id,
          p.conversationId,
          p,
          f ?? null,
        );
        const friendshipBlocked = f?.status === 'blocked';
        const blockedByMe =
          friendshipBlocked && f?.blockedByUserId === meId;

        items.push({
          id: p.conversationId,
          kind: 'direct',
          peerUserId: peer.id,
          peerName: `${peer.firstName} ${peer.lastName}`.trim() || peer.email,
          peerAvatarUrl: this.avatarUrlFor(peer),
          lastMessageAt: lastMsg
            ? lastMsg.createdAt.toISOString()
            : convRow?.createdAt.toISOString() ?? null,
          lastMessagePreview: lastMsg ? preview.text : 'Nova conversa',
          lastMessageType: preview.type,
          unreadCount,
          favorite: p.favorite,
          muted: p.muted,
          friendshipBlocked,
          blockedByMe,
        });
      } else if (conv.type === 'group') {
        const item = await this.buildGroupConversationListItem(meId, conv, p);
        if (item) {
          items.push(item);
        }
      }
    }

    items.sort((a, b) => {
      const ta = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
      const tb = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
      return tb - ta;
    });

    const days = Math.min(90, Math.max(1, opts?.days ?? 7));
    const dayMs = 86_400_000;
    let endMs: number;
    if (opts?.cursorEnd?.trim()) {
      endMs = new Date(opts.cursorEnd.trim()).getTime();
      if (Number.isNaN(endMs)) {
        throw new BadRequestException('cursorEnd inválido.');
      }
    } else {
      endMs = Date.now();
    }
    const windowStart = endMs - days * dayMs;

    const inWindow = items.filter((it) => {
      const t = it.lastMessageAt ? new Date(it.lastMessageAt).getTime() : 0;
      return t >= windowStart && t < endMs;
    });

    const hasMore = items.some((it) => {
      const t = it.lastMessageAt ? new Date(it.lastMessageAt).getTime() : 0;
      return t < windowStart;
    });

    return {
      conversations: inWindow,
      nextCursorEnd: hasMore ? new Date(windowStart).toISOString() : null,
      hasMore,
    };
  }

  /**
   * Pré-visualização na lista: @[uuid](Nome) → @Nome (parênteses fullwidth no token).
   */
  private prettifyMentionTokensInPreview(text: string): string {
    return text.replace(/@\[([^\]]+)\]\(([^)]*)\)/g, (_, _id, labelRaw) => {
      const label = String(labelRaw).replace(/（/g, '(').replace(/）/g, ')');
      return `@${label}`;
    });
  }

  private previewFromMessage(m: Message | null): { text: string; type: string } {
    if (!m) {
      return { text: '', type: 'texto' };
    }
    if (m.deletedForEveryoneAt) {
      return { text: 'Mensagem apagada', type: 'texto' };
    }
    const k = m.kind;
    if (k === 'text' || !k) {
      const raw = (m.text ?? '').trim() || 'Mensagem';
      return { text: this.prettifyMentionTokensInPreview(raw), type: 'texto' };
    }
    if (k === 'image') {
      const att = (
        m.payload as { attachment?: { asSticker?: boolean; asGif?: boolean } } | null
      )?.attachment;
      if (att?.asSticker) {
        return { text: 'Figurinha', type: 'imagem' };
      }
      if (att?.asGif) {
        return { text: 'GIF', type: 'imagem' };
      }
      return { text: 'Foto', type: 'imagem' };
    }
    if (k === 'video') {
      return { text: 'Video', type: 'video' };
    }
    if (k === 'audio') {
      return { text: 'Audio', type: 'audio' };
    }
    if (k === 'document') {
      const fn = (m.payload as { fileName?: string })?.fileName;
      return { text: fn ?? 'Ficheiro', type: 'arquivo' };
    }
    if (k === 'contact') {
      return { text: 'Contato', type: 'contato' };
    }
    return { text: 'Mensagem', type: 'texto' };
  }

  private senderProfileForDto(u: User): { name: string; avatarUrl: string | null } {
    const name = `${u.firstName} ${u.lastName}`.trim() || u.email;
    return { name, avatarUrl: this.avatarUrlFor(u) };
  }

  private toMessageDto(m: Message, sender?: User | null): MessageResponseDto {
    const deleted = !!m.deletedForEveryoneAt;
    const dto: MessageResponseDto = {
      id: m.id,
      conversationId: m.conversationId,
      senderId: m.senderId,
      sentAt: m.createdAt.toISOString(),
      kind: m.kind,
      text: m.text,
      payload: m.payload,
    };
    if (deleted) {
      dto.deletedForEveryone = true;
    }
    if (sender) {
      const p = this.senderProfileForDto(sender);
      dto.senderName = p.name;
      dto.senderAvatarUrl = p.avatarUrl;
    }
    return dto;
  }

  async getMessages(
    meId: string,
    conversationId: string,
  ): Promise<MessagesPageDto> {
    const { messages, peerPart, conv } = await this.fetchVisibleMessages(
      meId,
      conversationId,
    );
    const peerLastReadAt =
      conv.type === 'group'
        ? null
        : peerPart?.lastReadAt?.toISOString() ?? null;

    let messageDtos: MessageResponseDto[];
    if (conv.type === 'group' && messages.length > 0) {
      const senderIds = [...new Set(messages.map((x) => x.senderId))];
      const senders = await this.usersService.findActiveByIds(senderIds);
      const byId = new Map(senders.map((u) => [u.id, u]));
      messageDtos = messages.map((m) =>
        this.toMessageDto(m, byId.get(m.senderId) ?? null),
      );
    } else {
      messageDtos = messages.map((m) => this.toMessageDto(m));
    }

    return {
      messages: messageDtos,
      peerLastReadAt,
    };
  }

  async markConversationAsRead(
    meId: string,
    conversationId: string,
  ): Promise<{ lastReadAt: string }> {
    const { messages, myPart } = await this.fetchVisibleMessages(
      meId,
      conversationId,
    );
    /** +1 ms evita contagem fantasma de 1 não lida por arredondamento DB vs `createdAt > lastReadAt`. */
    const nextRead =
      messages.length > 0
        ? new Date(messages[messages.length - 1]!.createdAt.getTime() + 1)
        : new Date();
    myPart.lastReadAt = nextRead;
    await this.partRepo.save(myPart);

    const allReadParts = await this.partRepo.find({ where: { conversationId } });
    for (const op of allReadParts) {
      if (op.userId === meId) {
        continue;
      }
      this.sessionRegistry.emitToUser(op.userId, 'chat_read', {
        conversationId,
        lastReadAt: nextRead.toISOString(),
      });
    }

    await this.notificationsService.markChatNotificationsReadForConversation(
      meId,
      conversationId,
    );

    return { lastReadAt: nextRead.toISOString() };
  }

  /**
   * Notifica o outro participante (conversa directa) que este utilizador iniciou uma chamada de voz.
   * O cliente do destinatário recebe o evento Socket.IO `incoming_call` e pode abrir a UI de atender/recusar.
   */
  async notifyDirectVoiceCallInvite(
    meId: string,
    conversationId: string,
  ): Promise<{ ok: true }> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.type !== 'direct') {
      throw new BadRequestException(
        'Chamadas de voz só estão disponíveis em conversas directas.',
      );
    }
    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerPart = allParts.find((x) => x.userId !== meId);
    const peerId = peerPart?.userId;
    if (!peerId) {
      throw new BadRequestException('Conversa inválida.');
    }
    const friendship = await this.findFriendship(meId, peerId);
    this.assertFriendshipAllowsMessaging(friendship);
    const caller = await this.usersService.findActiveById(meId);
    if (!caller) {
      throw new ForbiddenException();
    }
    const callerName =
      `${caller.firstName} ${caller.lastName}`.trim() || 'Contacto';
    const callerAvatarUrl = this.avatarUrlFor(caller);
    await this.createCallLog({
      conversationId,
      callType: 'direct',
      initiatedByUserId: meId,
      participantUserIds: [meId, peerId],
      status: 'ringing',
    });
    this.sessionRegistry.emitToUser(peerId, 'incoming_call', {
      callerUserId: meId,
      callerName,
      callerAvatarUrl,
      conversationId,
      conversationKind: 'direct' as const,
      callSessionType: 'direct' as const,
    });
    return { ok: true };
  }

  /**
   * Quem recebe atende: notifica quem ligou para abrir a sessão na janela principal
   * (evento Socket.IO `voice_call_answered`, payload alinhado com `CallAnsweredPayload` no cliente).
   */
  async notifyCallerVoiceCallAnswered(
    meId: string,
    conversationId: string,
  ): Promise<{ ok: true }> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    if (conv.type === 'group' && this.getConversationGroupSubtype(conv) === 'call') {
      return { ok: true };
    }
    if (conv.type !== 'direct') {
      throw new BadRequestException(
        'Chamadas de voz só estão disponíveis em conversas directas.',
      );
    }
    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerPart = allParts.find((x) => x.userId !== meId);
    const callerUserId = peerPart?.userId;
    if (!callerUserId) {
      throw new BadRequestException('Conversa inválida.');
    }
    const friendship = await this.findFriendship(meId, callerUserId);
    this.assertFriendshipAllowsMessaging(friendship);
    const callee = await this.usersService.findActiveById(meId);
    if (!callee) {
      throw new ForbiddenException();
    }
    const peerName =
      `${callee.firstName} ${callee.lastName}`.trim() || 'Contacto';
    await this.markLatestCallLogAnswered(conversationId);
    this.sessionRegistry.emitToUser(callerUserId, 'voice_call_answered', {
      conversationId,
      peerName,
      conversationKind: 'direct' as const,
      callSessionType: 'direct' as const,
      roomId: conversationId,
      roomLayout: 'p2p' as const,
      callRole: 'caller' as const,
    });
    return { ok: true };
  }

  /**
   * Quem liga cancela, quem recebe recusa, ou o toque expira: notifica o outro participante
   * para fechar a janela de chamada (evento Socket.IO `voice_call_ring_ended`).
   */
  async notifyPeerVoiceCallRingEnded(
    meId: string,
    conversationId: string,
  ): Promise<{ ok: true }> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    if (conv.type === 'group' && this.getConversationGroupSubtype(conv) === 'call') {
      return { ok: true };
    }
    if (conv.type !== 'direct') {
      throw new BadRequestException(
        'Chamadas de voz só estão disponíveis em conversas directas.',
      );
    }
    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerPart = allParts.find((x) => x.userId !== meId);
    const peerId = peerPart?.userId;
    if (!peerId) {
      throw new BadRequestException('Conversa inválida.');
    }
    const friendship = await this.findFriendship(meId, peerId);
    this.assertFriendshipAllowsMessaging(friendship);
    this.sessionRegistry.emitToUser(peerId, 'voice_call_ring_ended', {
      conversationId,
    });
    await this.markLatestCallLogMissed(conversationId);
    return { ok: true };
  }

  /**
   * Durante a sessão na app principal: um dos dois encerra a chamada — notifica o outro
   * (evento Socket.IO `voice_call_session_ended`).
   */
  async notifyPeerVoiceCallSessionEnded(
    meId: string,
    conversationId: string,
  ): Promise<{ ok: true }> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    if (conv.type === 'group' && this.getConversationGroupSubtype(conv) === 'call') {
      return { ok: true };
    }
    if (conv.type !== 'direct') {
      throw new BadRequestException(
        'Chamadas de voz só estão disponíveis em conversas directas.',
      );
    }
    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerPart = allParts.find((x) => x.userId !== meId);
    const peerId = peerPart?.userId;
    if (!peerId) {
      throw new BadRequestException('Conversa inválida.');
    }
    const friendship = await this.findFriendship(meId, peerId);
    this.assertFriendshipAllowsMessaging(friendship);
    this.sessionRegistry.emitToUser(peerId, 'voice_call_session_ended', {
      conversationId,
    });
    await this.markLatestCallLogCompleted(conversationId);
    try {
      await this.mediasoupRoom.closeRoom(conversationId);
    } catch {
      /* ignore */
    }
    return { ok: true };
  }

  async assertVoiceConversationAccessOrThrow(
    meId: string,
    conversationId: string,
  ): Promise<'direct' | 'group'> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || (conv.type !== 'direct' && conv.type !== 'group')) {
      throw new BadRequestException('Sala de voz indisponível para esta conversa.');
    }
    if (conv.type === 'direct') {
      const allParts = await this.partRepo.find({ where: { conversationId } });
      const peerPart = allParts.find((x) => x.userId !== meId);
      const peerId = peerPart?.userId;
      if (!peerId) {
        throw new BadRequestException('Conversa inválida.');
      }
      const friendship = await this.findFriendship(meId, peerId);
      this.assertFriendshipAllowsMessaging(friendship);
    }
    return conv.type;
  }

  private async getVoiceConversationPeerIdsOrThrow(
    meId: string,
    conversationId: string,
  ): Promise<string[]> {
    const convType = await this.assertVoiceConversationAccessOrThrow(meId, conversationId);
    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerIds = allParts.map((x) => x.userId).filter((userId) => userId !== meId);
    if (convType === 'direct' && peerIds.length !== 1) {
      throw new BadRequestException('Conversa inválida.');
    }
    return peerIds;
  }

  /**
   * Valida amizade/conversa directa e devolve o `userId` do par (para SFU / relay).
   */
  async getDirectVoiceCallPeerIdOrThrow(meId: string, conversationId: string): Promise<string> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.type !== 'direct') {
      throw new BadRequestException(
        'Chamadas de voz só estão disponíveis em conversas directas.',
      );
    }
    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerPart = allParts.find((x) => x.userId !== meId);
    const peerId = peerPart?.userId;
    if (!peerId) {
      throw new BadRequestException('Conversa inválida.');
    }
    const friendship = await this.findFriendship(meId, peerId);
    this.assertFriendshipAllowsMessaging(friendship);
    return peerId;
  }

  /**
   * Encaminha sinalização WebRTC (SDP / ICE) para o outro participante da conversa directa.
   */
  async relayVoiceCallWebRtcSignal(meId: string, body: unknown): Promise<void> {
    if (!body || typeof body !== 'object') {
      return;
    }
    const conversationId = (body as { conversationId?: unknown }).conversationId;
    const signal = (body as { signal?: unknown }).signal;
    if (typeof conversationId !== 'string' || conversationId.length === 0 || signal === undefined) {
      return;
    }
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.type !== 'direct') {
      return;
    }
    const allParts = await this.partRepo.find({ where: { conversationId } });
    const peerPart = allParts.find((x) => x.userId !== meId);
    const peerId = peerPart?.userId;
    if (!peerId) {
      return;
    }
    const friendship = await this.findFriendship(meId, peerId);
    this.assertFriendshipAllowsMessaging(friendship);
    this.sessionRegistry.emitToUser(peerId, 'voice_call_webrtc_signal', {
      conversationId,
      fromUserId: meId,
      signal,
    });
  }

  /**
   * Encaminha indicação de fala (VAD) para o outro participante da conversa directa.
   * O cliente mostra o efeito na foto do interlocutor quando é ele a falar.
   */
  async relayVoiceCallVoiceActivity(meId: string, body: unknown): Promise<void> {
    if (!body || typeof body !== 'object') {
      return;
    }
    const conversationId = (body as { conversationId?: unknown }).conversationId;
    const speaking = (body as { speaking?: unknown }).speaking;
    if (typeof conversationId !== 'string' || conversationId.length === 0 || typeof speaking !== 'boolean') {
      return;
    }
    const peerIds = await this.getVoiceConversationPeerIdsOrThrow(meId, conversationId);
    for (const peerId of peerIds) {
      this.sessionRegistry.emitToUser(peerId, 'voice_call_voice_activity', {
        conversationId,
        fromUserId: meId,
        speaking,
      });
    }
  }

  async relayVoiceCallMicMuted(meId: string, body: unknown): Promise<void> {
    if (!body || typeof body !== 'object') {
      return;
    }
    const conversationId = (body as { conversationId?: unknown }).conversationId;
    const micMuted = (body as { micMuted?: unknown }).micMuted;
    if (typeof conversationId !== 'string' || conversationId.length === 0 || typeof micMuted !== 'boolean') {
      return;
    }
    const peerIds = await this.getVoiceConversationPeerIdsOrThrow(meId, conversationId);
    for (const peerId of peerIds) {
      this.sessionRegistry.emitToUser(peerId, 'voice_call_mic_muted', {
        conversationId,
        fromUserId: meId,
        micMuted,
      });
    }
  }

  async relayVoiceCallCameraOff(meId: string, body: unknown): Promise<void> {
    if (!body || typeof body !== 'object') {
      return;
    }
    const conversationId = (body as { conversationId?: unknown }).conversationId;
    const cameraOff = (body as { cameraOff?: unknown }).cameraOff;
    if (typeof conversationId !== 'string' || conversationId.length === 0 || typeof cameraOff !== 'boolean') {
      return;
    }
    const peerIds = await this.getVoiceConversationPeerIdsOrThrow(meId, conversationId);
    for (const peerId of peerIds) {
      this.sessionRegistry.emitToUser(peerId, 'voice_call_camera_off', {
        conversationId,
        fromUserId: meId,
        cameraOff,
      });
    }
  }

  async updateConversationPreferences(
    meId: string,
    conversationId: string,
    dto: UpdateConversationPreferencesDto,
  ): Promise<{ favorite: boolean; muted: boolean }> {
    if (dto.favorite === undefined && dto.muted === undefined) {
      throw new BadRequestException('Indique favorite ou muted.');
    }
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    if (dto.favorite !== undefined) {
      part.favorite = dto.favorite;
    }
    if (dto.muted !== undefined) {
      part.muted = dto.muted;
    }
    await this.partRepo.save(part);
    return { favorite: part.favorite, muted: part.muted };
  }

  async sendMessage(
    meId: string,
    conversationId: string,
    dto: SendMessageDto,
  ): Promise<{
    message: MessageResponseDto;
    deliveredToPeer: boolean;
  }> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || (conv.type !== 'direct' && conv.type !== 'group')) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    const allParts = await this.partRepo.find({ where: { conversationId } });
    const kind = (dto.kind || 'text').trim() || 'text';

    if (conv.type === 'direct') {
      const peerPart = allParts.find((x) => x.userId !== meId);
      const peerId = peerPart?.userId;
      if (!peerId) {
        throw new BadRequestException('Conversa inválida.');
      }
      const friendship = await this.findFriendship(meId, peerId);
      this.assertFriendshipAllowsMessaging(friendship);
    } else {
      const memberIds = allParts.map((x) => x.userId);
      if (!memberIds.includes(meId)) {
        throw new ForbiddenException('Sem acesso a esta conversa.');
      }
    }

    const msg = this.msgRepo.create({
      conversationId,
      senderId: meId,
      kind,
      text: dto.text?.trim() ? dto.text.trim() : null,
      payload: dto.payload ?? null,
    });
    await this.msgRepo.save(msg);
    await this.upsertConversationMediaFromMessage(msg);
    const senderUser =
      conv.type === 'group' ? await this.usersService.findActiveById(meId) : null;
    const response = this.toMessageDto(msg, senderUser);

    if (conv.type === 'direct') {
      const peerPart = allParts.find((x) => x.userId !== meId);
      const peerId = peerPart?.userId;
      if (!peerId) {
        throw new BadRequestException('Conversa inválida.');
      }

      this.sessionRegistry.emitToUser(peerId, 'chat_message', {
        conversationId,
        message: response,
        /** Preferência do destinatário: não tocar som / notificação no cliente. */
        muted: peerPart.muted,
      });

      const sender = await this.usersService.findActiveById(meId);
      if (
        sender &&
        !peerPart.muted &&
        !this.sessionRegistry.isUserFocusedOnConversation(peerId, conversationId)
      ) {
        await this.notificationsService.createChatMessageNotification(
          peerId,
          sender,
          conversationId,
          msg.id,
          this.previewFromMessage(msg).text,
        );
      }

      return { message: response, deliveredToPeer: true };
    }

    const memberIds = allParts.map((x) => x.userId);
    const sender = await this.usersService.findActiveById(meId);
    for (const uid of memberIds) {
      if (uid === meId) {
        continue;
      }
      const recipientPart = allParts.find((x) => x.userId === uid);
      const recipientMuted = recipientPart?.muted === true;
      this.sessionRegistry.emitToUser(uid, 'chat_message', {
        conversationId,
        message: response,
        muted: recipientMuted,
      });
      if (
        sender &&
        !recipientMuted &&
        !this.sessionRegistry.isUserFocusedOnConversation(uid, conversationId)
      ) {
        await this.notificationsService.createChatMessageNotification(
          uid,
          sender,
          conversationId,
          msg.id,
          this.previewFromMessage(msg).text,
        );
      }
    }

    return { message: response, deliveredToPeer: true };
  }

  async deleteMessageForEveryone(
    meId: string,
    conversationId: string,
    messageId: string,
  ): Promise<{ ok: true }> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({
      where: { id: conversationId },
    });
    if (!conv || (conv.type !== 'direct' && conv.type !== 'group')) {
      throw new NotFoundException('Conversa não encontrada.');
    }
    const msg = await this.msgRepo.findOne({
      where: { id: messageId, conversationId },
    });
    if (!msg) {
      throw new NotFoundException('Mensagem não encontrada.');
    }
    if (msg.senderId !== meId) {
      throw new ForbiddenException('Só pode apagar as suas mensagens.');
    }
    if (msg.deletedForEveryoneAt) {
      throw new BadRequestException('Mensagem já foi apagada.');
    }

    const allParts = await this.partRepo.find({ where: { conversationId } });
    const others = allParts.filter((x) => x.userId !== meId);

    await this.conversationMediaRepo.delete({ messageId: msg.id });

    msg.deletedForEveryoneAt = new Date();
    msg.text = null;
    msg.kind = 'text';
    msg.payload = { deletedForEveryone: true };
    await this.msgRepo.save(msg);

    const tombSender =
      conv.type === 'group'
        ? await this.usersService.findActiveById(msg.senderId)
        : null;
    const tombstone = this.toMessageDto(msg, tombSender);

    this.sessionRegistry.emitToUser(meId, 'chat_message_deleted_for_everyone', {
      conversationId,
      messageId: msg.id,
    });

    if (conv.type === 'group') {
      for (const op of others) {
        this.sessionRegistry.emitToUser(op.userId, 'chat_message_deleted_for_everyone', {
          conversationId,
          messageId: msg.id,
          message: tombstone,
        });
      }
      return { ok: true };
    }

    const peerId = others[0]?.userId;
    if (!peerId) {
      throw new BadRequestException('Conversa inválida.');
    }
    const friendship = await this.findFriendship(meId, peerId);
    const peerSees =
      !friendship ||
      friendship.status !== 'blocked' ||
      !this.shouldHideIncoming(peerId, meId, friendship);

    if (peerSees) {
      this.sessionRegistry.emitToUser(peerId, 'chat_message_deleted_for_everyone', {
        conversationId,
        messageId: msg.id,
        message: tombstone,
      });
    }

    return { ok: true };
  }

  async clearConversationForMe(
    meId: string,
    conversationId: string,
  ): Promise<void> {
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const now = new Date();
    part.clearedHistoryAt = now;
    part.lastReadAt = now;
    await this.partRepo.save(part);
  }

  /**
   * Remove o utilizador do grupo; a conversa deixa de aparecer na lista dele.
   */
  async leaveGroupConversation(meId: string, conversationId: string): Promise<void> {
    const conv = await this.convRepo.findOne({ where: { id: conversationId } });
    if (!conv || conv.type !== 'group') {
      throw new BadRequestException('Apenas conversas em grupo.');
    }
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    await this.partRepo.delete({ conversationId, userId: meId });
  }

  private static readonly CHAT_UPLOAD_MIMES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/webm',
    'audio/ogg',
    'audio/wav',
    'audio/mp4',
    'application/pdf',
  ]);

  async saveChatAttachment(
    meId: string,
    conversationId: string,
    file: Express.Multer.File | undefined,
    trim?: { startSec: number; endSec: number },
  ): Promise<{
    path: string;
    fileName: string;
    mimeType: string;
    size: number;
    /** JPEG relativo em `data/uploads`, frame ~ao meio do vídeo. */
    posterPath?: string;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Ficheiro em falta.');
    }
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({
      where: { id: conversationId },
    });
    if (!conv || (conv.type !== 'direct' && conv.type !== 'group')) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    if (conv.type === 'direct') {
      const allPartsAtt = await this.partRepo.find({ where: { conversationId } });
      const peerPartAtt = allPartsAtt.find((x) => x.userId !== meId);
      const peerIdAtt = peerPartAtt?.userId;
      if (!peerIdAtt) {
        throw new BadRequestException('Conversa inválida.');
      }
      const friendshipAtt = await this.findFriendship(meId, peerIdAtt);
      this.assertFriendshipAllowsMessaging(friendshipAtt);
    }

    const mime = (file.mimetype ?? '').toLowerCase();
    if (!ChatService.CHAT_UPLOAD_MIMES.has(mime)) {
      throw new BadRequestException('Tipo de ficheiro não permitido.');
    }

    let outBuffer = file.buffer;
    let outSize = file.size;
    let outMime = mime;
    let safe = (file.originalname || 'file')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .slice(0, 120);

    if (trim) {
      if (!mime.startsWith('video/')) {
        throw new BadRequestException('Corte só é suportado para vídeo.');
      }
      const tmpIn = join(tmpdir(), `incall-chat-in-${uuidv7()}`);
      try {
        await writeFile(tmpIn, file.buffer);
        const durationSec = probeVideoDurationSec(tmpIn);
        const { start, end } = clampTrimRange(trim.startSec, trim.endSec, durationSec);
        if (end - start < CHAT_VIDEO_MIN_TRIM_SEC - 1e-9) {
          throw new BadRequestException('Trecho de vídeo demasiado curto.');
        }
        if (isFullRangeTrim(start, end, durationSec)) {
          unlinkSync(tmpIn);
        } else {
          const trimmed = trimVideoFileToMp4(tmpIn, start, end);
          unlinkSync(tmpIn);
          outBuffer = trimmed.buffer;
          outSize = trimmed.size;
          outMime = 'video/mp4';
          const base = safe.replace(/\.[^.]+$/, '') || 'video';
          safe = `${base}.mp4`;
        }
      } catch (e) {
        try {
          unlinkSync(tmpIn);
        } catch {
          /* ignore */
        }
        if (e instanceof BadRequestException) {
          throw e;
        }
        throw new BadRequestException(
          'Não foi possível processar o corte do vídeo. Tente outro ficheiro ou intervalo.',
        );
      }
    }

    const id = uuidv7();
    const relative = `chat/${conversationId}/${id}_${safe}`;
    const uploadsRoot = join(process.cwd(), 'data', 'uploads');
    const fullPath = join(uploadsRoot, relative);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await writeFile(fullPath, outBuffer);

    let posterPath: string | undefined;
    if (outMime.startsWith('video/')) {
      const posterId = uuidv7();
      const posterRelative = `chat/${conversationId}/${posterId}_poster.jpg`;
      const posterFull = join(uploadsRoot, posterRelative);
      try {
        extractMiddleFrameJpeg(fullPath, posterFull);
        posterPath = posterRelative.replace(/\\/g, '/');
      } catch {
        /* poster opcional se ffmpeg falhar */
      }
    }

    return {
      path: relative.replace(/\\/g, '/'),
      fileName: safe,
      mimeType: outMime,
      size: outSize,
      ...(posterPath ? { posterPath } : {}),
    };
  }

  /**
   * Remove o fundo da imagem (PNG com alpha). Usa o mesmo acesso à conversa que o upload de figurinha.
   */
  async removeStickerImageBackground(
    meId: string,
    conversationId: string,
    file: Express.Multer.File | undefined,
  ): Promise<Buffer> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Ficheiro em falta.');
    }
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({
      where: { id: conversationId },
    });
    if (!conv || (conv.type !== 'direct' && conv.type !== 'group')) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    if (conv.type === 'direct') {
      const allPartsSt = await this.partRepo.find({ where: { conversationId } });
      const peerPartSt = allPartsSt.find((x) => x.userId !== meId);
      const peerIdSt = peerPartSt?.userId;
      if (!peerIdSt) {
        throw new BadRequestException('Conversa inválida.');
      }
      const friendshipSt = await this.findFriendship(meId, peerIdSt);
      this.assertFriendshipAllowsMessaging(friendshipSt);
    }

    const mime = (file.mimetype ?? '').toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('Envie apenas uma imagem.');
    }
    if (mime === 'image/svg+xml') {
      throw new BadRequestException('SVG não é suportado.');
    }

    try {
      const blob = await removeBackground(new Uint8Array(file.buffer), {
        model: 'medium',
        output: { format: 'image/png' },
      });
      const ab = await blob.arrayBuffer();
      return Buffer.from(ab);
    } catch {
      throw new BadRequestException(
        'Não foi possível remover o fundo desta imagem. Tente outro ficheiro.',
      );
    }
  }

  /**
   * Converte uma imagem em WebP estilo figurinha (WhatsApp) com wa-sticker-formatter e grava em disco.
   */
  async saveStickerFromImage(
    meId: string,
    conversationId: string,
    file: Express.Multer.File | undefined,
  ): Promise<{
    path: string;
    fileName: string;
    mimeType: string;
    size: number;
  }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Ficheiro em falta.');
    }
    const part = await this.getParticipant(conversationId, meId);
    if (!part) {
      throw new ForbiddenException('Sem acesso a esta conversa.');
    }
    const conv = await this.convRepo.findOne({
      where: { id: conversationId },
    });
    if (!conv || (conv.type !== 'direct' && conv.type !== 'group')) {
      throw new NotFoundException('Conversa não encontrada.');
    }

    if (conv.type === 'direct') {
      const allPartsSt = await this.partRepo.find({ where: { conversationId } });
      const peerPartSt = allPartsSt.find((x) => x.userId !== meId);
      const peerIdSt = peerPartSt?.userId;
      if (!peerIdSt) {
        throw new BadRequestException('Conversa inválida.');
      }
      const friendshipSt = await this.findFriendship(meId, peerIdSt);
      this.assertFriendshipAllowsMessaging(friendshipSt);
    }

    const mime = (file.mimetype ?? '').toLowerCase();
    if (!mime.startsWith('image/')) {
      throw new BadRequestException('Envie apenas uma imagem para criar a figurinha.');
    }
    if (mime === 'image/svg+xml') {
      throw new BadRequestException('SVG não é suportado para figurinhas.');
    }

    let outBuffer: Buffer;
    try {
      const sticker = new Sticker(file.buffer, {
        pack: 'Incall',
        author: 'Sticker',
        type: StickerTypes.FULL,
        quality: 75,
      });
      outBuffer = await sticker.build();
    } catch {
      throw new BadRequestException(
        'Não foi possível criar a figurinha a partir desta imagem. Tente outro ficheiro.',
      );
    }

    const id = uuidv7();
    const safe = `sticker_${id}.webp`;
    const relative = `chat/${conversationId}/${id}_${safe}`;
    const uploadsRoot = join(process.cwd(), 'data', 'uploads');
    const fullPath = join(uploadsRoot, relative);
    const dir = dirname(fullPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    await writeFile(fullPath, outBuffer);

    return {
      path: relative.replace(/\\/g, '/'),
      fileName: safe,
      mimeType: 'image/webp',
      size: outBuffer.length,
    };
  }
}
