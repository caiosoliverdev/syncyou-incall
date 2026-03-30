import { Inject, Logger, forwardRef } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SkipThrottle } from '@nestjs/throttler';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { ChatService } from '../../chat/chat.service';
import type {
  CallConferenceParticipantDto,
  GroupAudioRoomParticipantDto,
} from '../../chat/chat.service';
import { MediasoupRoomService } from '../../mediasoup/mediasoup-room.service';
import { ContactsService } from '../../contacts/contacts.service';
import { SessionRegistryService } from './session-registry.service';

@SkipThrottle()
@WebSocketGateway({
  namespace: '/session',
  cors: { origin: '*', credentials: false },
})
export class SessionGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(SessionGateway.name);
  private readonly groupAudioRooms = new Map<
    string,
    Map<string, GroupAudioRoomParticipantDto & { socketIds: Set<string> }>
  >();
  private readonly socketGroupAudioRooms = new Map<string, Set<string>>();
  private readonly callConferenceRooms = new Map<
    string,
    Map<string, CallConferenceParticipantDto & { socketIds: Set<string> }>
  >();
  private readonly socketCallConferenceRooms = new Map<string, Set<string>>();

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly registry: SessionRegistryService,
    @Inject(forwardRef(() => ContactsService))
    private readonly contactsService: ContactsService,
    @Inject(forwardRef(() => ChatService))
    private readonly chatService: ChatService,
    private readonly mediasoupRoom: MediasoupRoomService,
  ) {}

  afterInit(): void {
    this.registry.setServer(this.server);
    this.logger.log('Socket.IO namespace /session ready');
  }

  async handleConnection(client: Socket): Promise<void> {
    const raw =
      typeof client.handshake.auth?.token === 'string'
        ? client.handshake.auth.token
        : extractBearer(client.handshake.headers.authorization);
    if (!raw) {
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        typ?: string;
        sid?: string;
      }>(raw);
      if (payload.typ !== 'access' || !payload.sid) {
        client.disconnect(true);
        return;
      }
      await client.join(`session:${payload.sid}`);
      await client.join(`user:${payload.sub}`);
      this.registry.register(payload.sub, payload.sid, client.id);
      void this.contactsService.notifyFriendsOfCurrentPresence(payload.sub);
    } catch {
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.leaveAllGroupAudioRoomsForSocket(client.id);
    this.leaveAllCallConferenceRoomsForSocket(client.id);
    const result = this.registry.unregister(client.id);
    if (result?.lastSocketClosed) {
      void this.contactsService.setPresenceInvisibleWhenLastSocketClosed(result.userId);
    }
  }

  private broadcastGroupAudioRoomParticipants(conversationId: string): void {
    const room = this.groupAudioRooms.get(conversationId);
    if (!room) return;
    const participants = [...room.values()].map(({ socketIds: _socketIds, ...participant }) => ({
      ...participant,
    }));
    for (const participant of room.values()) {
      this.registry.emitToUser(participant.userId, 'group_audio_room_participants', {
        conversationId,
        participants,
      });
    }
  }

  private joinGroupAudioRoom(
    socketId: string,
    conversationId: string,
    participant: GroupAudioRoomParticipantDto,
  ): GroupAudioRoomParticipantDto[] {
    let room = this.groupAudioRooms.get(conversationId);
    if (!room) {
      room = new Map();
      this.groupAudioRooms.set(conversationId, room);
    }
    const existing = room.get(participant.userId);
    if (existing) {
      existing.socketIds.add(socketId);
    } else {
      room.set(participant.userId, { ...participant, socketIds: new Set([socketId]) });
    }
    const socketRooms = this.socketGroupAudioRooms.get(socketId) ?? new Set<string>();
    socketRooms.add(conversationId);
    this.socketGroupAudioRooms.set(socketId, socketRooms);
    this.broadcastGroupAudioRoomParticipants(conversationId);
    return [...room.values()].map(({ socketIds: _socketIds, ...p }) => ({ ...p }));
  }

  private leaveGroupAudioRoom(socketId: string, conversationId: string): void {
    const socketRooms = this.socketGroupAudioRooms.get(socketId);
    socketRooms?.delete(conversationId);
    if (socketRooms && socketRooms.size === 0) {
      this.socketGroupAudioRooms.delete(socketId);
    }
    const room = this.groupAudioRooms.get(conversationId);
    if (!room) return;
    for (const [userId, participant] of room) {
      if (!participant.socketIds.has(socketId)) continue;
      participant.socketIds.delete(socketId);
      if (participant.socketIds.size === 0) {
        room.delete(userId);
      }
      break;
    }
    if (room.size === 0) {
      this.groupAudioRooms.delete(conversationId);
      return;
    }
    this.broadcastGroupAudioRoomParticipants(conversationId);
  }

  private leaveAllGroupAudioRoomsForSocket(socketId: string): void {
    const rooms = [...(this.socketGroupAudioRooms.get(socketId) ?? [])];
    for (const conversationId of rooms) {
      this.leaveGroupAudioRoom(socketId, conversationId);
    }
  }

  private broadcastCallConferenceParticipants(conversationId: string): void {
    const room = this.callConferenceRooms.get(conversationId);
    if (!room) return;
    const participants = [...room.values()].map(({ socketIds: _socketIds, ...participant }) => ({
      ...participant,
    }));
    for (const participant of room.values()) {
      this.registry.emitToUser(participant.userId, 'call_conference_participants', {
        conversationId,
        participants,
      });
    }
  }

  private joinCallConference(
    socketId: string,
    conversationId: string,
    participant: CallConferenceParticipantDto,
  ): CallConferenceParticipantDto[] {
    let room = this.callConferenceRooms.get(conversationId);
    if (!room) {
      room = new Map();
      this.callConferenceRooms.set(conversationId, room);
    }
    const existing = room.get(participant.userId);
    if (existing) {
      existing.socketIds.add(socketId);
    } else {
      room.set(participant.userId, { ...participant, socketIds: new Set([socketId]) });
    }
    const socketRooms = this.socketCallConferenceRooms.get(socketId) ?? new Set<string>();
    socketRooms.add(conversationId);
    this.socketCallConferenceRooms.set(socketId, socketRooms);
    this.broadcastCallConferenceParticipants(conversationId);
    return [...room.values()].map(({ socketIds: _socketIds, ...p }) => ({ ...p }));
  }

  private leaveCallConference(socketId: string, conversationId: string): void {
    const socketRooms = this.socketCallConferenceRooms.get(socketId);
    socketRooms?.delete(conversationId);
    if (socketRooms && socketRooms.size === 0) {
      this.socketCallConferenceRooms.delete(socketId);
    }
    const room = this.callConferenceRooms.get(conversationId);
    if (!room) return;
    for (const [userId, participant] of room) {
      if (!participant.socketIds.has(socketId)) continue;
      participant.socketIds.delete(socketId);
      if (participant.socketIds.size === 0) {
        room.delete(userId);
      }
      break;
    }
    if (room.size === 0) {
      this.callConferenceRooms.delete(conversationId);
      void this.chatService.markLatestCallLogCompleted(conversationId);
      return;
    }
    this.broadcastCallConferenceParticipants(conversationId);
  }

  private leaveAllCallConferenceRoomsForSocket(socketId: string): void {
    const rooms = [...(this.socketCallConferenceRooms.get(socketId) ?? [])];
    for (const conversationId of rooms) {
      this.leaveCallConference(socketId, conversationId);
    }
  }

  /* ─── Mediasoup SFU (activo por defeito; MEDIASOUP_ENABLED=false desliga) ─── */

  @SubscribeMessage('mediasoup_join')
  async handleMediasoupJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    if (!conversationId) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      await this.chatService.assertVoiceConversationAccessOrThrow(userId, conversationId);
      return await this.mediasoupRoom.join(userId, conversationId);
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('mediasoup_create_transport')
  async handleMediasoupCreateTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    const direction = readDirection(body);
    if (!conversationId || !direction) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      await this.chatService.assertVoiceConversationAccessOrThrow(userId, conversationId);
      return await this.mediasoupRoom.createTransport(userId, conversationId, direction);
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('mediasoup_connect_transport')
  async handleMediasoupConnectTransport(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    const transportId = readTransportId(body);
    const dtlsParameters = readDtlsParameters(body);
    if (!conversationId || !transportId || !dtlsParameters) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      await this.chatService.assertVoiceConversationAccessOrThrow(userId, conversationId);
      return await this.mediasoupRoom.connectTransport(
        userId,
        conversationId,
        transportId,
        dtlsParameters,
      );
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('mediasoup_produce')
  async handleMediasoupProduce(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    const transportId = readTransportId(body);
    const kind = readProduceKind(body);
    const rtpParameters = readRtpParameters(body);
    const appData = readAppData(body);
    if (!conversationId || !transportId || !kind || !rtpParameters) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      await this.chatService.assertVoiceConversationAccessOrThrow(userId, conversationId);
      return await this.mediasoupRoom.produce(
        userId,
        conversationId,
        transportId,
        kind,
        rtpParameters,
        appData,
      );
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('mediasoup_consume')
  async handleMediasoupConsume(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    const transportId = readTransportId(body);
    const producerId = readProducerId(body);
    const rtpCapabilities = readRtpCapabilities(body);
    if (!conversationId || !transportId || !producerId || !rtpCapabilities) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      await this.chatService.assertVoiceConversationAccessOrThrow(userId, conversationId);
      return await this.mediasoupRoom.consume(
        userId,
        conversationId,
        transportId,
        producerId,
        rtpCapabilities,
      );
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('mediasoup_resume_consumer')
  async handleMediasoupResumeConsumer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    const consumerId = readConsumerId(body);
    if (!conversationId || !consumerId) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      await this.chatService.assertVoiceConversationAccessOrThrow(userId, conversationId);
      return await this.mediasoupRoom.resumeConsumer(userId, conversationId, consumerId);
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('mediasoup_leave')
  async handleMediasoupLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    if (!conversationId) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      await this.chatService.assertVoiceConversationAccessOrThrow(userId, conversationId);
      await this.mediasoupRoom.leave(userId, conversationId);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('mediasoup_close_producer')
  async handleMediasoupCloseProducer(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    const producerId = readProducerId(body);
    if (!conversationId || !producerId) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      await this.chatService.assertVoiceConversationAccessOrThrow(userId, conversationId);
      return await this.mediasoupRoom.closeProducer(userId, conversationId, producerId);
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('group_audio_room_join')
  async handleGroupAudioRoomJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    if (!conversationId) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      const participant = await this.chatService.getGroupAudioRoomParticipant(
        userId,
        conversationId,
      );
      const participants = this.joinGroupAudioRoom(client.id, conversationId, participant);
      return { ok: true as const, participants };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('group_audio_room_leave')
  handleGroupAudioRoomLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): { ok: true } | { ok: false; error: string } {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    if (!conversationId) {
      return { ok: false as const, error: 'bad_body' };
    }
    this.leaveGroupAudioRoom(client.id, conversationId);
    return { ok: true as const };
  }

  @SubscribeMessage('call_conference_join')
  async handleCallConferenceJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<unknown> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    if (!conversationId) {
      return { ok: false as const, error: 'bad_body' };
    }
    try {
      const participant = await this.chatService.getCallConferenceParticipant(
        userId,
        conversationId,
      );
      await this.chatService.markGroupCallParticipantJoined(conversationId, userId);
      const participants = this.joinCallConference(client.id, conversationId, participant);
      return { ok: true as const, participants };
    } catch (e) {
      return { ok: false as const, error: String(e) };
    }
  }

  @SubscribeMessage('call_conference_leave')
  handleCallConferenceLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): { ok: true } | { ok: false; error: string } {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return { ok: false as const, error: 'unauthorized' };
    }
    const conversationId = readConversationId(body);
    if (!conversationId) {
      return { ok: false as const, error: 'bad_body' };
    }
    void this.chatService.markGroupCallParticipantLeft(conversationId, userId);
    this.leaveCallConference(client.id, conversationId);
    return { ok: true as const };
  }

  /** Encaminha SDP / ICE para o par na conversa directa (WebRTC áudio). */
  @SubscribeMessage('voice_call_webrtc_signal')
  async handleVoiceCallWebRtcSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return;
    }
    try {
      await this.chatService.relayVoiceCallWebRtcSignal(userId, body);
    } catch (e) {
      this.logger.warn(`voice_call_webrtc_signal: ${String(e)}`);
    }
  }

  /** Indicação de fala (VAD) para o par ver o efeito na chamada. */
  @SubscribeMessage('voice_call_voice_activity')
  async handleVoiceCallVoiceActivity(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return;
    }
    try {
      await this.chatService.relayVoiceCallVoiceActivity(userId, body);
    } catch (e) {
      this.logger.warn(`voice_call_voice_activity: ${String(e)}`);
    }
  }

  /** Estado de mute do microfone para o par ver na UI. */
  @SubscribeMessage('voice_call_mic_muted')
  async handleVoiceCallMicMuted(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return;
    }
    try {
      await this.chatService.relayVoiceCallMicMuted(userId, body);
    } catch (e) {
      this.logger.warn(`voice_call_mic_muted: ${String(e)}`);
    }
  }

  /** Estado da câmera (ligada/desligada) para o par actualizar a UI sem depender só do WebRTC. */
  @SubscribeMessage('voice_call_camera_off')
  async handleVoiceCallCameraOff(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const userId = this.registry.getUserIdForSocket(client.id);
    if (!userId) {
      return;
    }
    try {
      await this.chatService.relayVoiceCallCameraOff(userId, body);
    } catch (e) {
      this.logger.warn(`voice_call_camera_off: ${String(e)}`);
    }
  }

  /** Cliente: conversa aberta no painel Mensagens (`null` = nenhuma ou outro menu). */
  @SubscribeMessage('chat_focus')
  handleChatFocus(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: unknown,
  ): void {
    let conversationId: string | null = null;
    if (body && typeof body === 'object' && 'conversationId' in body) {
      const v = (body as { conversationId?: unknown }).conversationId;
      if (v === null || v === '') {
        conversationId = null;
      } else if (typeof v === 'string' && v.length > 0) {
        conversationId = v;
      }
    }
    this.registry.setFocusedConversation(client.id, conversationId);
  }
}

function readConversationId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { conversationId?: unknown }).conversationId;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readTransportId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { transportId?: unknown }).transportId;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readProducerId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { producerId?: unknown }).producerId;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readConsumerId(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { consumerId?: unknown }).consumerId;
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function readDirection(body: unknown): 'send' | 'recv' | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { direction?: unknown }).direction;
  if (v === 'send' || v === 'recv') {
    return v;
  }
  return undefined;
}

function readProduceKind(body: unknown): 'audio' | 'video' | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { kind?: unknown }).kind;
  if (v === 'audio' || v === 'video') {
    return v;
  }
  return undefined;
}

function readRtpParameters(body: unknown): import('mediasoup/types').RtpParameters | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { rtpParameters?: unknown }).rtpParameters;
  if (!v || typeof v !== 'object') {
    return undefined;
  }
  return v as import('mediasoup/types').RtpParameters;
}

function readRtpCapabilities(
  body: unknown,
): import('mediasoup/types').RtpCapabilities | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { rtpCapabilities?: unknown }).rtpCapabilities;
  if (!v || typeof v !== 'object') {
    return undefined;
  }
  return v as import('mediasoup/types').RtpCapabilities;
}

function readDtlsParameters(
  body: unknown,
): import('mediasoup/types').DtlsParameters | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { dtlsParameters?: unknown }).dtlsParameters;
  if (!v || typeof v !== 'object') {
    return undefined;
  }
  return v as import('mediasoup/types').DtlsParameters;
}

function readAppData(body: unknown): Record<string, unknown> | undefined {
  if (!body || typeof body !== 'object') {
    return undefined;
  }
  const v = (body as { appData?: unknown }).appData;
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    return undefined;
  }
  return v as Record<string, unknown>;
}

function extractBearer(auth: unknown): string | undefined {
  if (typeof auth !== 'string') {
    return undefined;
  }
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m?.[1];
}
