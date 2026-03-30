import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { SessionRegistryService } from '../auth/session/session-registry.service';
import { Notification } from './entities/notification.entity';

export type NotificationActorDto = {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
};

export type FriendRequestPayloadDto = {
  friendshipId: string;
  actor: NotificationActorDto;
};

export type ChatMessageNotificationPayloadDto = {
  conversationId: string;
  /** Última mensagem não lida (mais recente). */
  lastMessageId: string;
  /** Acumulado enquanto a notificação está por ler. */
  unreadCount: number;
  actor: NotificationActorDto;
  preview: string;
  /** Legado (antes do acumulativo por conversa). */
  messageId?: string;
};

export type AppNotificationDto =
  | {
      id: string;
      kind: 'friend_request';
      read: boolean;
      createdAt: string;
      title: string;
      body: string;
      data: FriendRequestPayloadDto;
    }
  | {
      id: string;
      kind: 'chat_message';
      read: boolean;
      createdAt: string;
      title: string;
      body: string;
      data: ChatMessageNotificationPayloadDto;
    };

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    private readonly sessionRegistry: SessionRegistryService,
    private readonly config: ConfigService,
  ) {}

  private get filesBase(): string {
    const base = this.config
      .getOrThrow<{ baseUrl: string }>('app')
      .baseUrl.replace(/\/$/, '');
    return `${base}/api/v1/files`;
  }

  private actorFromUser(user: User): NotificationActorDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      avatarUrl: user.avatarUrl ? `${this.filesBase}/${user.avatarUrl}` : null,
    };
  }

  private toDto(row: Notification): AppNotificationDto {
    if (row.kind === 'friend_request') {
      const payload = row.payload as unknown as FriendRequestPayloadDto;
      const name = `${payload.actor.firstName} ${payload.actor.lastName}`.trim();
      return {
        id: row.id,
        kind: 'friend_request',
        read: row.readAt != null,
        createdAt: row.createdAt.toISOString(),
        title: 'Pedido de amizade',
        body: name ? `${name} quer adicionar-te como amigo.` : 'Novo pedido de amizade.',
        data: payload,
      };
    }
    const raw = row.payload as unknown as ChatMessageNotificationPayloadDto;
    const payload: ChatMessageNotificationPayloadDto = {
      ...raw,
      lastMessageId: raw.lastMessageId ?? raw.messageId ?? '',
      unreadCount: raw.unreadCount ?? 1,
    };
    const first = payload.actor.firstName?.trim() || '';
    const fullName = `${payload.actor.firstName} ${payload.actor.lastName}`.trim();
    const label = first || fullName || 'Alguém';
    const uc = payload.unreadCount;
    const body =
      uc > 1
        ? `${label} enviou ${uc} mensagens novas.`
        : payload.preview?.trim() || '1 mensagem nova.';
    return {
      id: row.id,
      kind: 'chat_message',
      read: row.readAt != null,
      createdAt: row.createdAt.toISOString(),
      title: fullName ? `Mensagens de ${fullName}` : 'Novas mensagens',
      body,
      data: payload,
    };
  }

  async listForUser(userId: string): Promise<{
    items: AppNotificationDto[];
    unreadCount: number;
  }> {
    const rows = await this.notifRepo.find({
      where: { userId },
      order: { updatedAt: 'DESC' },
      take: 50,
    });
    const unreadCount = await this.notifRepo.count({
      where: { userId, readAt: IsNull() },
    });
    return {
      items: rows.map((r) => this.toDto(r)),
      unreadCount,
    };
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    const row = await this.notifRepo.findOne({
      where: { id: notificationId, userId },
    });
    if (!row) {
      throw new NotFoundException('Notificação não encontrada.');
    }
    if (row.readAt) {
      return;
    }
    row.readAt = new Date();
    await this.notifRepo.save(row);
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifRepo.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
  }

  /** Remove notificações de mensagem associadas à conversa (ex.: ao apagar o grupo). */
  async deleteChatNotificationsForConversation(conversationId: string): Promise<void> {
    await this.notifRepo
      .createQueryBuilder()
      .delete()
      .from(Notification)
      .where('kind = :k', { k: 'chat_message' })
      .andWhere(`payload->>'conversationId' = :cid`, { cid: conversationId })
      .execute();
  }

  async markChatNotificationsReadForConversation(
    userId: string,
    conversationId: string,
  ): Promise<void> {
    const rows = await this.notifRepo
      .createQueryBuilder('n')
      .where('n.userId = :uid', { uid: userId })
      .andWhere('n.kind = :k', { k: 'chat_message' })
      .andWhere('n.readAt IS NULL')
      .andWhere(`n.payload->>'conversationId' = :cid`, { cid: conversationId })
      .getMany();

    const now = new Date();
    for (const row of rows) {
      row.readAt = now;
    }
    if (rows.length > 0) {
      await this.notifRepo.save(rows);
    }
  }

  async createFriendRequestNotification(
    recipientId: string,
    requester: User,
    friendshipId: string,
  ): Promise<void> {
    const actor = this.actorFromUser(requester);
    const payload: FriendRequestPayloadDto = { friendshipId, actor };
    const row = this.notifRepo.create({
      userId: recipientId,
      kind: 'friend_request',
      payload: payload as unknown as Record<string, unknown>,
      readAt: null,
    });
    const saved = await this.notifRepo.save(row);
    const dto = this.toDto(saved);
    this.sessionRegistry.emitToUser(recipientId, 'notification', dto);
  }

  async createChatMessageNotification(
    recipientId: string,
    sender: User,
    conversationId: string,
    messageId: string,
    preview: string,
  ): Promise<void> {
    const actor = this.actorFromUser(sender);
    const existing = await this.notifRepo
      .createQueryBuilder('n')
      .where('n.userId = :uid', { uid: recipientId })
      .andWhere('n.kind = :k', { k: 'chat_message' })
      .andWhere('n.readAt IS NULL')
      .andWhere(`n.payload->>'conversationId' = :cid`, { cid: conversationId })
      .getOne();

    if (existing) {
      const prev = existing.payload as unknown as ChatMessageNotificationPayloadDto;
      const unreadCount = (prev.unreadCount ?? 1) + 1;
      const nextPayload: ChatMessageNotificationPayloadDto = {
        conversationId,
        lastMessageId: messageId,
        unreadCount,
        actor,
        preview,
      };
      existing.payload = nextPayload as unknown as Record<string, unknown>;
      const saved = await this.notifRepo.save(existing);
      const dto = this.toDto(saved);
      this.sessionRegistry.emitToUser(recipientId, 'notification', dto);
      return;
    }

    const payload: ChatMessageNotificationPayloadDto = {
      conversationId,
      lastMessageId: messageId,
      unreadCount: 1,
      actor,
      preview,
    };
    const row = this.notifRepo.create({
      userId: recipientId,
      kind: 'chat_message',
      payload: payload as unknown as Record<string, unknown>,
      readAt: null,
    });
    const saved = await this.notifRepo.save(row);
    const dto = this.toDto(saved);
    this.sessionRegistry.emitToUser(recipientId, 'notification', dto);
  }
}
