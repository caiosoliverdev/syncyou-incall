import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SessionRegistryService } from '../auth/session/session-registry.service';
import { NotificationsService } from '../notifications/notifications.service';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Friendship } from './entities/friendship.entity';

export type ContactPeerDto = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  avatarUrl: string | null;
  phoneWhatsapp: string | null;
  socialDiscord: string | null;
  socialLinkedin: string | null;
  socialYoutube: string | null;
  socialInstagram: string | null;
  socialFacebook: string | null;
  websiteUrl: string | null;
  presenceStatus: 'online' | 'away' | 'busy' | 'invisible' | 'on_call';
};

export type ContactFriendRowDto = {
  friendshipId: string;
  peer: ContactPeerDto;
  friendsSince: string;
};

export type ContactRequestRowDto = {
  friendshipId: string;
  peer: ContactPeerDto;
  direction: 'incoming' | 'outgoing';
  createdAt: string;
};

/** Amizades que eu bloqueei (posso desbloquear). */
export type ContactBlockedRowDto = {
  friendshipId: string;
  peer: ContactPeerDto;
  blockedAt: string;
};

export type InviteFriendshipResponseDto = {
  friendshipId: string;
  status: 'pending' | 'accepted' | 'incoming_pending';
  peer: ContactPeerDto;
  /** Quando `incoming_pending`: a outra pessoa já tinha enviado pedido a mim. */
  message?: string;
};

const PRESENCE_VALUES = ['online', 'away', 'busy', 'invisible', 'on_call'] as const;

@Injectable()
export class ContactsService {
  private readonly logger = new Logger(ContactsService.name);

  constructor(
    @InjectRepository(Friendship)
    private readonly friendshipRepo: Repository<Friendship>,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly sessionRegistry: SessionRegistryService,
  ) {}

  private get filesBase(): string {
    const base = this.config
      .getOrThrow<{ apiPublicOrigin: string }>('urls')
      .apiPublicOrigin.replace(/\/$/, '');
    return `${base}/api/v1/files`;
  }

  private normalizePeerPresence(
    raw: string | undefined | null,
  ): 'online' | 'away' | 'busy' | 'invisible' | 'on_call' {
    if (raw && PRESENCE_VALUES.includes(raw as (typeof PRESENCE_VALUES)[number])) {
      return raw as (typeof PRESENCE_VALUES)[number];
    }
    return 'online';
  }

  private toPeerDto(user: User): ContactPeerDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      avatarUrl: user.avatarUrl ? `${this.filesBase}/${user.avatarUrl}` : null,
      phoneWhatsapp: user.phoneWhatsapp ?? null,
      socialDiscord: user.socialDiscord ?? null,
      socialLinkedin: user.socialLinkedin ?? null,
      socialYoutube: user.socialYoutube ?? null,
      socialInstagram: user.socialInstagram ?? null,
      socialFacebook: user.socialFacebook ?? null,
      websiteUrl: user.websiteUrl ?? null,
      presenceStatus: this.normalizePeerPresence(user.presenceStatus),
    };
  }

  /**
   * Presença mostrada a amigos: a BD guarda a preferência; sem socket activo os outros veem invisível.
   */
  private toPeerDtoForFriendList(user: User): ContactPeerDto {
    const base = this.toPeerDto(user);
    if (base.presenceStatus === 'invisible') {
      return base;
    }
    if (!this.sessionRegistry.hasAnySocket(user.id)) {
      return { ...base, presenceStatus: 'invisible' };
    }
    return base;
  }

  /** IDs de utilizadores com amizade aceite (os dois lados). */
  async getAcceptedFriendUserIds(userId: string): Promise<string[]> {
    const rows = await this.friendshipRepo.find({
      where: [
        { requesterId: userId, status: 'accepted' },
        { addresseeId: userId, status: 'accepted' },
      ],
    });
    return rows.map((r) =>
      r.requesterId === userId ? r.addresseeId : r.requesterId,
    );
  }

  /** Emite para todos os amigos o estado de presença deste utilizador (tempo real). */
  async notifyFriendsPresenceChanged(
    userId: string,
    presenceStatus: 'online' | 'away' | 'busy' | 'invisible' | 'on_call',
  ): Promise<void> {
    const friendIds = await this.getAcceptedFriendUserIds(userId);
    for (const fid of friendIds) {
      this.sessionRegistry.emitToUser(fid, 'peer_presence', {
        peerUserId: userId,
        presenceStatus,
      });
    }
  }

  /**
   * Quando o último socket fecha, os amigos veem invisível em tempo real.
   * A preferência na BD (online/ausente/ocupado) não é alterada — volta ao voltar a abrir a app.
   */
  async setPresenceInvisibleWhenLastSocketClosed(userId: string): Promise<void> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      return;
    }
    if (this.normalizePeerPresence(user.presenceStatus) === 'invisible') {
      return;
    }
    await this.notifyFriendsPresenceChanged(userId, 'invisible');
  }

  /** Ao ligar o socket, os amigos recebem o estado atual (BD) para actualizar a bolinha. */
  async notifyFriendsOfCurrentPresence(userId: string): Promise<void> {
    const user = await this.usersService.findActiveById(userId);
    if (!user) {
      return;
    }
    try {
      await this.notifyFriendsPresenceChanged(
        userId,
        this.normalizePeerPresence(user.presenceStatus),
      );
    } catch (e) {
      this.logger.warn(`notifyFriendsOfCurrentPresence: ${(e as Error).message}`);
    }
  }

  private async loadUsersByIds(ids: string[]): Promise<Map<string, User>> {
    if (ids.length === 0) return new Map();
    const users = await this.usersService.findActiveByIds(ids);
    return new Map(users.map((u) => [u.id, u]));
  }

  /**
   * Perfil público (telefone, redes) de um amigo — dados actuais na BD.
   * Usado pelo cliente para actualizar UI sem depender da lista de amigos em cache.
   */
  async getFriendPeerProfile(
    meId: string,
    peerUserId: string,
  ): Promise<{ peer: ContactPeerDto }> {
    if (peerUserId === meId) {
      throw new BadRequestException('Indique outro utilizador.');
    }
    const f = await this.findBetween(meId, peerUserId);
    if (!f || f.status !== 'accepted') {
      throw new ForbiddenException(
        'Só pode ver o perfil de contactos com amizade aceite.',
      );
    }
    const u = await this.usersService.findActiveById(peerUserId);
    if (!u) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    return { peer: this.toPeerDtoForFriendList(u) };
  }

  async listFriends(meId: string): Promise<{ friends: ContactFriendRowDto[] }> {
    const rows = await this.friendshipRepo.find({
      where: [
        { requesterId: meId, status: 'accepted' },
        { addresseeId: meId, status: 'accepted' },
      ],
      order: { updatedAt: 'DESC' },
    });
    const peerIds = rows.map((r) =>
      r.requesterId === meId ? r.addresseeId : r.requesterId,
    );
    const userMap = await this.loadUsersByIds(peerIds);
    const friends: ContactFriendRowDto[] = [];
    for (const row of rows) {
      const peerId = row.requesterId === meId ? row.addresseeId : row.requesterId;
      const u = userMap.get(peerId);
      if (!u) continue;
      friends.push({
        friendshipId: row.id,
        peer: this.toPeerDtoForFriendList(u),
        friendsSince: row.updatedAt.toISOString(),
      });
    }
    return { friends };
  }

  async listRequests(meId: string): Promise<{
    incoming: ContactRequestRowDto[];
    outgoing: ContactRequestRowDto[];
  }> {
    const incomingRows = await this.friendshipRepo.find({
      where: { addresseeId: meId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    const outgoingRows = await this.friendshipRepo.find({
      where: { requesterId: meId, status: 'pending' },
      order: { createdAt: 'DESC' },
    });
    const incomingPeerIds = incomingRows.map((r) => r.requesterId);
    const outgoingPeerIds = outgoingRows.map((r) => r.addresseeId);
    const userMap = await this.loadUsersByIds([
      ...incomingPeerIds,
      ...outgoingPeerIds,
    ]);

    const incoming: ContactRequestRowDto[] = [];
    for (const row of incomingRows) {
      const u = userMap.get(row.requesterId);
      if (!u) continue;
      incoming.push({
        friendshipId: row.id,
        peer: this.toPeerDto(u),
        direction: 'incoming',
        createdAt: row.createdAt.toISOString(),
      });
    }

    const outgoing: ContactRequestRowDto[] = [];
    for (const row of outgoingRows) {
      const u = userMap.get(row.addresseeId);
      if (!u) continue;
      outgoing.push({
        friendshipId: row.id,
        peer: this.toPeerDto(u),
        direction: 'outgoing',
        createdAt: row.createdAt.toISOString(),
      });
    }

    return { incoming, outgoing };
  }

  async listBlockedByMe(meId: string): Promise<{ blocked: ContactBlockedRowDto[] }> {
    const rows = await this.friendshipRepo.find({
      where: { status: 'blocked', blockedByUserId: meId },
      order: { updatedAt: 'DESC' },
    });
    const peerIds = rows.map((r) =>
      r.requesterId === meId ? r.addresseeId : r.requesterId,
    );
    const userMap = await this.loadUsersByIds(peerIds);
    const blocked: ContactBlockedRowDto[] = [];
    for (const row of rows) {
      const peerId = row.requesterId === meId ? row.addresseeId : row.requesterId;
      const u = userMap.get(peerId);
      if (!u) continue;
      blocked.push({
        friendshipId: row.id,
        peer: this.toPeerDto(u),
        blockedAt: row.updatedAt.toISOString(),
      });
    }
    return { blocked };
  }

  private async findBetween(
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

  async inviteByEmail(
    meId: string,
    emailRaw: string,
  ): Promise<InviteFriendshipResponseDto> {
    const email = emailRaw.toLowerCase().trim();
    const target = await this.usersService.findActiveByEmail(email);
    if (!target) {
      throw new NotFoundException('Não existe utilizador com este email.');
    }
    if (target.id === meId) {
      throw new BadRequestException('Não pode convidar o próprio email.');
    }
    return this.invitePeerOrThrow(meId, target);
  }

  async inviteByUserId(
    meId: string,
    peerUserId: string,
  ): Promise<InviteFriendshipResponseDto> {
    if (peerUserId === meId) {
      throw new BadRequestException('Não pode convidar o próprio utilizador.');
    }
    const target = await this.usersService.findActiveById(peerUserId);
    if (!target) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    return this.invitePeerOrThrow(meId, target);
  }

  private async invitePeerOrThrow(
    meId: string,
    target: User,
  ): Promise<InviteFriendshipResponseDto> {
    const existing = await this.findBetween(meId, target.id);
    if (existing) {
      if (existing.status === 'accepted') {
        throw new ConflictException(
          'Esta pessoa já está na sua lista de amigos. Não é necessário enviar convite.',
        );
      }
      if (existing.status === 'blocked') {
        if (existing.blockedByUserId === meId) {
          throw new ForbiddenException(
            'Este contacto está na sua lista de bloqueados. Desbloqueie-o na aba Bloqueados antes de enviar um convite.',
          );
        }
        throw new ForbiddenException(
          'Não pode enviar convite a este utilizador (relação bloqueada).',
        );
      }
      if (existing.status === 'pending') {
        if (
          existing.requesterId === meId &&
          existing.addresseeId === target.id
        ) {
          return {
            friendshipId: existing.id,
            status: 'pending',
            peer: this.toPeerDto(target),
          };
        }
        if (
          existing.requesterId === target.id &&
          existing.addresseeId === meId
        ) {
          return {
            friendshipId: existing.id,
            status: 'incoming_pending',
            peer: this.toPeerDto(target),
            message:
              'Esta pessoa já lhe enviou um pedido de amizade. Abra a aba Pedidos para aceitar ou recusar.',
          };
        }
      }
    }

    const row = this.friendshipRepo.create({
      requesterId: meId,
      addresseeId: target.id,
      status: 'pending',
      blockedByUserId: null,
    });
    const saved = await this.friendshipRepo.save(row);
    const requester = await this.usersService.findActiveById(meId);
    if (requester) {
      await this.notificationsService.createFriendRequestNotification(
        target.id,
        requester,
        saved.id,
      );
    }
    return {
      friendshipId: saved.id,
      status: 'pending',
      peer: this.toPeerDto(target),
    };
  }

  async acceptRequest(meId: string, friendshipId: string): Promise<void> {
    const row = await this.friendshipRepo.findOne({
      where: { id: friendshipId },
    });
    if (!row) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (row.addresseeId !== meId) {
      throw new ForbiddenException('Só pode aceitar pedidos recebidos.');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('Este pedido já não está pendente.');
    }
    row.status = 'accepted';
    row.blockedByUserId = null;
    await this.friendshipRepo.save(row);
  }

  async rejectRequest(meId: string, friendshipId: string): Promise<void> {
    const row = await this.friendshipRepo.findOne({
      where: { id: friendshipId },
    });
    if (!row) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (row.addresseeId !== meId) {
      throw new ForbiddenException('Só pode recusar pedidos recebidos.');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('Este pedido já não está pendente.');
    }
    await this.friendshipRepo.remove(row);
  }

  async cancelOutgoing(meId: string, friendshipId: string): Promise<void> {
    const row = await this.friendshipRepo.findOne({
      where: { id: friendshipId },
    });
    if (!row) {
      throw new NotFoundException('Pedido não encontrado.');
    }
    if (row.requesterId !== meId) {
      throw new ForbiddenException('Só pode cancelar pedidos enviados.');
    }
    if (row.status !== 'pending') {
      throw new ConflictException('Este pedido já não está pendente.');
    }
    await this.friendshipRepo.remove(row);
  }

  async blockPeer(meId: string, peerUserId: string): Promise<void> {
    if (peerUserId === meId) {
      throw new BadRequestException('Operação inválida.');
    }
    const peer = await this.usersService.findActiveById(peerUserId);
    if (!peer) {
      throw new NotFoundException('Utilizador não encontrado.');
    }
    const row = await this.findBetween(meId, peerUserId);
    if (!row || row.status !== 'accepted') {
      throw new ConflictException('Só pode bloquear amigos aceites.');
    }
    row.status = 'blocked';
    row.blockedByUserId = meId;
    await this.friendshipRepo.save(row);
    this.sessionRegistry.emitToUser(peerUserId, 'friendship_update', {
      type: 'blocked',
      peerUserId: meId,
    });
    this.sessionRegistry.emitToUser(meId, 'friendship_update', {
      type: 'blocked',
      peerUserId: peerUserId,
    });
  }

  async unblockPeer(meId: string, peerUserId: string): Promise<void> {
    if (peerUserId === meId) {
      throw new BadRequestException('Operação inválida.');
    }
    const row = await this.findBetween(meId, peerUserId);
    if (!row || row.status !== 'blocked') {
      throw new ConflictException('Não há bloqueio activo com este utilizador.');
    }
    if (row.blockedByUserId !== meId) {
      throw new ForbiddenException('Só quem bloqueou pode desbloquear.');
    }
    row.status = 'accepted';
    row.blockedByUserId = null;
    await this.friendshipRepo.save(row);
    this.sessionRegistry.emitToUser(peerUserId, 'friendship_update', {
      type: 'unblocked',
      peerUserId: meId,
    });
    this.sessionRegistry.emitToUser(meId, 'friendship_update', {
      type: 'unblocked',
      peerUserId: peerUserId,
    });
  }
}
