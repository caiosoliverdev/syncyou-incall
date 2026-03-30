import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

/**
 * Regista ligações Socket.IO por utilizador e refresh token (`sid` no JWT).
 * Só sessões com pelo menos um socket ligado contam como "activas" na API.
 */
@Injectable()
export class SessionRegistryService {
  private readonly logger = new Logger(SessionRegistryService.name);
  private server: Server | null = null;

  /** socketId → metadados (conversa aberta no cliente, por separador) */
  private readonly socketMeta = new Map<
    string,
    { userId: string; sid: string; focusedConversationId: string | null }
  >();
  /** userId → Map<refreshTokenId, contagem de sockets> */
  private readonly userSessions = new Map<string, Map<string, number>>();

  setServer(server: Server): void {
    this.server = server;
  }

  register(userId: string, sid: string, socketId: string): void {
    this.socketMeta.set(socketId, { userId, sid, focusedConversationId: null });
    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Map());
    }
    const m = this.userSessions.get(userId)!;
    m.set(sid, (m.get(sid) ?? 0) + 1);
    this.logger.debug(`session socket + user=${userId} sid=${sid} n=${m.get(sid)}`);
  }

  /**
   * Remove o socket. Se não restar nenhuma ligação para este utilizador (nenhum sid com contagem > 0),
   * `lastSocketClosed` é true — ex.: último separador / logout / app fechada.
   */
  unregister(socketId: string): {
    userId: string;
    lastSocketClosed: boolean;
  } | null {
    const meta = this.socketMeta.get(socketId);
    if (!meta) {
      return null;
    }
    this.socketMeta.delete(socketId);
    const m = this.userSessions.get(meta.userId);
    if (!m) {
      return { userId: meta.userId, lastSocketClosed: true };
    }
    const next = (m.get(meta.sid) ?? 0) - 1;
    if (next <= 0) {
      m.delete(meta.sid);
    } else {
      m.set(meta.sid, next);
    }
    if (m.size === 0) {
      this.userSessions.delete(meta.userId);
      this.logger.debug(`session socket - user=${meta.userId} sid=${meta.sid} (último socket)`);
      return { userId: meta.userId, lastSocketClosed: true };
    }
    this.logger.debug(`session socket - user=${meta.userId} sid=${meta.sid}`);
    return { userId: meta.userId, lastSocketClosed: false };
  }

  /** IDs de refresh token com pelo menos uma ligação Socket.IO activa. */
  getActiveSessionIds(userId: string): string[] {
    const m = this.userSessions.get(userId);
    if (!m) {
      return [];
    }
    return [...m.keys()];
  }

  /** Pelo menos um socket ligado (utilizador com sessão activa na app). */
  hasAnySocket(userId: string): boolean {
    const m = this.userSessions.get(userId);
    return m != null && m.size > 0;
  }

  getUserIdForSocket(socketId: string): string | null {
    return this.socketMeta.get(socketId)?.userId ?? null;
  }

  /** Cliente reporta qual conversa está visível (painel Mensagens). */
  setFocusedConversation(socketId: string, conversationId: string | null): void {
    const meta = this.socketMeta.get(socketId);
    if (!meta) {
      return;
    }
    meta.focusedConversationId = conversationId;
  }

  /** Algum separador deste utilizador tem esta conversa aberta. */
  isUserFocusedOnConversation(userId: string, conversationId: string): boolean {
    for (const [, meta] of this.socketMeta) {
      if (meta.userId === userId && meta.focusedConversationId === conversationId) {
        return true;
      }
    }
    return false;
  }

  /** Emite para todos os sockets do utilizador (sala `user:{userId}`). */
  emitToUser(userId: string, event: string, payload: unknown): void {
    if (!this.server) {
      return;
    }
    this.server.to(`user:${userId}`).emit(event, payload);
  }

  /** Notifica todos os clientes dessa sessão (mesmo `sid`) a terminarem sessão. */
  notifySessionRevoked(refreshTokenId: string): void {
    if (!this.server) {
      return;
    }
    this.server.to(`session:${refreshTokenId}`).emit('session_ended', {
      reason: 'revoked' as const,
    });
  }
}
