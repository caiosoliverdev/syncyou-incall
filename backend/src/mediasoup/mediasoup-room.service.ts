import { Injectable, Logger } from '@nestjs/common';
import type {
  Consumer,
  DtlsParameters,
  Producer,
  RtpCapabilities,
  RtpParameters,
  WebRtcTransport,
} from 'mediasoup/types';
import { SessionRegistryService } from '../auth/session/session-registry.service';
import { MediasoupService } from './mediasoup.service';

export type MediasoupExistingProducer = {
  producerId: string;
  producerUserId: string;
  kind: string;
  appData?: Record<string, unknown>;
};

export type MediasoupClosedProducer = {
  producerId: string;
  producerUserId: string;
  kind: string;
  appData?: Record<string, unknown>;
};

type PeerState = {
  sendTransport: WebRtcTransport | null;
  recvTransport: WebRtcTransport | null;
  producers: Map<string, Producer>;
  consumers: Map<string, Consumer>;
};

type RoomState = {
  peers: Map<string, PeerState>;
};

/**
 * SFU por conversa ({@code conversationId}): transports, producers e consumers por utilizador.
 */
@Injectable()
export class MediasoupRoomService {
  private readonly logger = new Logger(MediasoupRoomService.name);
  private readonly rooms = new Map<string, RoomState>();

  constructor(
    private readonly ms: MediasoupService,
    private readonly sessionRegistry: SessionRegistryService,
  ) {}

  private roomOf(conversationId: string): RoomState {
    let r = this.rooms.get(conversationId);
    if (!r) {
      r = { peers: new Map() };
      this.rooms.set(conversationId, r);
    }
    return r;
  }

  private peerOf(conversationId: string, userId: string): PeerState {
    const room = this.roomOf(conversationId);
    let p = room.peers.get(userId);
    if (!p) {
      p = {
        sendTransport: null,
        recvTransport: null,
        producers: new Map(),
        consumers: new Map(),
      };
      room.peers.set(userId, p);
    }
    return p;
  }

  private findTransport(
    conversationId: string,
    userId: string,
    transportId: string,
  ): WebRtcTransport | null {
    const peer = this.roomOf(conversationId).peers.get(userId);
    if (!peer) return null;
    if (peer.sendTransport?.id === transportId) return peer.sendTransport;
    if (peer.recvTransport?.id === transportId) return peer.recvTransport;
    return null;
  }

  private notifyProducerClosed(
    conversationId: string,
    ownerUserId: string,
    closed: MediasoupClosedProducer,
  ): void {
    const room = this.roomOf(conversationId);
    for (const [peerId] of room.peers) {
      if (peerId === ownerUserId) continue;
      this.sessionRegistry.emitToUser(peerId, 'mediasoup_producer_closed', {
        conversationId,
        producerId: closed.producerId,
        producerUserId: closed.producerUserId,
        kind: closed.kind,
        appData: closed.appData,
      });
    }
  }

  async join(
    userId: string,
    conversationId: string,
  ): Promise<
    | { ok: true; rtpCapabilities: RtpCapabilities; existingProducers: MediasoupExistingProducer[] }
    | { ok: false; error: string }
  > {
    if (!this.ms.isEnabled()) {
      return { ok: false, error: 'mediasoup_disabled' };
    }
    const router = await this.ms.getOrCreateRouter(conversationId);
    if (!router) {
      return { ok: false, error: 'no_worker' };
    }
    this.peerOf(conversationId, userId);
    const room = this.roomOf(conversationId);
    const existingProducers: MediasoupExistingProducer[] = [];
    for (const [peerId, peer] of room.peers) {
      if (peerId === userId) continue;
      for (const prod of peer.producers.values()) {
        existingProducers.push({
          producerId: prod.id,
          producerUserId: peerId,
          kind: prod.kind,
          appData: prod.appData as Record<string, unknown> | undefined,
        });
      }
    }
    return {
      ok: true,
      rtpCapabilities: router.rtpCapabilities,
      existingProducers,
    };
  }

  async createTransport(
    userId: string,
    conversationId: string,
    direction: 'send' | 'recv',
  ): Promise<
    | {
        ok: true;
        id: string;
        iceParameters: WebRtcTransport['iceParameters'];
        iceCandidates: WebRtcTransport['iceCandidates'];
        dtlsParameters: WebRtcTransport['dtlsParameters'];
      }
    | { ok: false; error: string }
  > {
    const router = this.ms.getRouter(conversationId);
    if (!router) {
      return { ok: false, error: 'no_room' };
    }
    const peer = this.roomOf(conversationId).peers.get(userId);
    if (!peer) {
      return { ok: false, error: 'not_joined' };
    }
    try {
      const transport = await router.createWebRtcTransport(this.ms.getWebRtcTransportOptions());
      if (direction === 'send') {
        peer.sendTransport?.close();
        peer.sendTransport = transport;
      } else {
        peer.recvTransport?.close();
        peer.recvTransport = transport;
      }
      transport.on('dtlsstatechange', (state) => {
        if (state === 'closed') {
          transport.close();
        }
      });
      return {
        ok: true,
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      };
    } catch (e) {
      this.logger.warn(`createTransport: ${String(e)}`);
      return { ok: false, error: 'create_transport_failed' };
    }
  }

  async connectTransport(
    userId: string,
    conversationId: string,
    transportId: string,
    dtlsParameters: DtlsParameters,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const t = this.findTransport(conversationId, userId, transportId);
    if (!t) {
      return { ok: false, error: 'no_transport' };
    }
    try {
      await t.connect({ dtlsParameters });
      return { ok: true };
    } catch (e) {
      this.logger.warn(`connectTransport: ${String(e)}`);
      return { ok: false, error: 'connect_failed' };
    }
  }

  async produce(
    userId: string,
    conversationId: string,
    transportId: string,
    kind: 'audio' | 'video',
    rtpParameters: RtpParameters,
    appData?: Record<string, unknown>,
  ): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
    const peer = this.roomOf(conversationId).peers.get(userId);
    if (!peer?.sendTransport || peer.sendTransport.id !== transportId) {
      return { ok: false, error: 'bad_send_transport' };
    }
    try {
      const producer = await peer.sendTransport.produce({ kind, rtpParameters, appData });
      peer.producers.set(producer.id, producer);
      producer.on('transportclose', () => {
        peer.producers.delete(producer.id);
        this.notifyProducerClosed(conversationId, userId, {
          producerId: producer.id,
          producerUserId: userId,
          kind: producer.kind,
          appData: producer.appData as Record<string, unknown> | undefined,
        });
      });
      const room = this.roomOf(conversationId);
      for (const [peerId] of room.peers) {
        if (peerId === userId) continue;
        this.sessionRegistry.emitToUser(peerId, 'mediasoup_new_producer', {
          conversationId,
          producerId: producer.id,
          producerUserId: userId,
          kind: producer.kind,
          appData: producer.appData,
        });
      }
      return { ok: true, id: producer.id };
    } catch (e) {
      this.logger.warn(`produce: ${String(e)}`);
      return { ok: false, error: 'produce_failed' };
    }
  }

  async consume(
    userId: string,
    conversationId: string,
    transportId: string,
    producerId: string,
    rtpCapabilities: RtpCapabilities,
  ): Promise<
    | {
        ok: true;
        id: string;
        producerId: string;
        kind: Consumer['kind'];
        rtpParameters: Consumer['rtpParameters'];
        type: Consumer['type'];
      }
    | { ok: false; error: string }
  > {
    const router = this.ms.getRouter(conversationId);
    const peer = this.roomOf(conversationId).peers.get(userId);
    if (!router || !peer?.recvTransport || peer.recvTransport.id !== transportId) {
      return { ok: false, error: 'bad_recv_transport' };
    }
    let producer: Producer | undefined;
    for (const [, pState] of this.roomOf(conversationId).peers) {
      producer = pState.producers.get(producerId);
      if (producer) break;
    }
    if (!producer) {
      return { ok: false, error: 'no_producer' };
    }
    try {
      if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) {
        return { ok: false, error: 'cannot_consume' };
      }
      const consumer = await peer.recvTransport.consume({
        producerId: producer.id,
        rtpCapabilities,
        paused: true,
      });
      peer.consumers.set(consumer.id, consumer);
      consumer.on('transportclose', () => {
        peer.consumers.delete(consumer.id);
      });
      return {
        ok: true,
        id: consumer.id,
        producerId: consumer.producerId,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
      };
    } catch (e) {
      this.logger.warn(`consume: ${String(e)}`);
      return { ok: false, error: 'consume_failed' };
    }
  }

  async resumeConsumer(
    userId: string,
    conversationId: string,
    consumerId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const peer = this.roomOf(conversationId).peers.get(userId);
    const consumer = peer?.consumers.get(consumerId);
    if (!consumer) {
      return { ok: false, error: 'no_consumer' };
    }
    try {
      await consumer.resume();
      return { ok: true };
    } catch (e) {
      this.logger.warn(`resumeConsumer: ${String(e)}`);
      return { ok: false, error: 'resume_failed' };
    }
  }

  async closeProducer(
    userId: string,
    conversationId: string,
    producerId: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    const peer = this.roomOf(conversationId).peers.get(userId);
    if (!peer) {
      return { ok: false, error: 'no_producer' };
    }
    const producer = peer.producers.get(producerId);
    if (!producer) {
      return { ok: false, error: 'no_producer' };
    }
    producer.close();
    peer.producers.delete(producerId);
    this.notifyProducerClosed(conversationId, userId, {
      producerId,
      producerUserId: userId,
      kind: producer.kind,
      appData: producer.appData as Record<string, unknown> | undefined,
    });
    return { ok: true };
  }

  async leave(userId: string, conversationId: string): Promise<void> {
    const room = this.rooms.get(conversationId);
    if (!room) {
      return;
    }
    const peer = room.peers.get(userId);
    if (!peer) return;
    for (const c of peer.consumers.values()) {
      c.close();
    }
    peer.consumers.clear();
    for (const p of peer.producers.values()) {
      this.notifyProducerClosed(conversationId, userId, {
        producerId: p.id,
        producerUserId: userId,
        kind: p.kind,
        appData: p.appData as Record<string, unknown> | undefined,
      });
      p.close();
    }
    peer.producers.clear();
    peer.sendTransport?.close();
    peer.recvTransport?.close();
    peer.sendTransport = null;
    peer.recvTransport = null;
    room.peers.delete(userId);
    if (room.peers.size === 0) {
      this.rooms.delete(conversationId);
      await this.ms.closeRoom(conversationId);
    }
  }

  async closeRoom(conversationId: string): Promise<void> {
    const room = this.rooms.get(conversationId);
    if (!room) {
      await this.ms.closeRoom(conversationId);
      return;
    }
    for (const [, peer] of room.peers) {
      for (const c of peer.consumers.values()) {
        c.close();
      }
      for (const p of peer.producers.values()) {
        p.close();
      }
      peer.sendTransport?.close();
      peer.recvTransport?.close();
    }
    room.peers.clear();
    this.rooms.delete(conversationId);
    await this.ms.closeRoom(conversationId);
  }
}
