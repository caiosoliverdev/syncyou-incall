import type { ChatMessage, OutgoingReceipt } from "@/data/mock-conversation-messages";
import type { ChatMessageApi } from "@/lib/api";
import { apiOrigin } from "@/lib/api";

/** IDs de conversa vindos da API são UUID v7. */
export function isChatApiConversationId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    id,
  );
}

export function chatFilePublicUrl(path: string): string {
  const p = path.replace(/^\/+/, "");
  if (p.startsWith("http://") || p.startsWith("https://")) return p;
  return `${apiOrigin()}/api/v1/files/${p}`;
}

function normalizeAttachmentUrls(att: ChatMessage["attachment"]): ChatMessage["attachment"] {
  if (!att) return att;
  if (att.kind === "image") {
    return { ...att, url: chatFilePublicUrl(att.url) };
  }
  if (att.kind === "video") {
    return {
      ...att,
      url: chatFilePublicUrl(att.url),
      posterUrl: att.posterUrl ? chatFilePublicUrl(att.posterUrl) : att.posterUrl,
    };
  }
  if (att.kind === "audio") {
    return { ...att, url: chatFilePublicUrl(att.url) };
  }
  if (att.kind === "document") {
    return att.url ? { ...att, url: chatFilePublicUrl(att.url) } : att;
  }
  return att;
}

export function mapApiMessageToChatMessage(
  m: ChatMessageApi,
  meId: string,
  peerDisplayName: string,
): ChatMessage {
  const outgoing = m.senderId === meId;
  const payload = m.payload ?? undefined;
  const isRevoked =
    m.deletedForEveryone === true ||
    (payload && (payload as { deletedForEveryone?: boolean }).deletedForEveryone === true);
  const incomingSenderName = outgoing
    ? undefined
    : (m.senderName?.trim() || peerDisplayName);
  const incomingSenderAvatar = outgoing ? undefined : (m.senderAvatarUrl ?? undefined);

  if (isRevoked) {
    return {
      id: m.id,
      conversationId: m.conversationId,
      sentAt: m.sentAt,
      text: "",
      outgoing,
      senderName: incomingSenderName,
      senderAvatarUrl: incomingSenderAvatar,
      deletedForEveryone: true,
    };
  }
  const rawAtt = payload?.attachment as ChatMessage["attachment"] | undefined;
  let attachment = rawAtt ? normalizeAttachmentUrls(rawAtt) : undefined;
  const sc = payload?.stickerCaption as
    | { text?: string; xPercent?: number; yPercent?: number }
    | undefined;
  if (
    attachment?.kind === "image" &&
    attachment.asSticker &&
    sc &&
    typeof sc.text === "string" &&
    sc.text.trim()
  ) {
    attachment = {
      ...attachment,
      captionOnSticker: {
        text: sc.text.trim(),
        xPercent: typeof sc.xPercent === "number" ? sc.xPercent : 50,
        yPercent: typeof sc.yPercent === "number" ? sc.yPercent : 18,
      },
    };
  }
  const replyTo = payload?.replyTo as ChatMessage["replyTo"] | undefined;
  const forwardOf = payload?.forwardOf as ChatMessage["forwardOf"] | undefined;

  return {
    id: m.id,
    conversationId: m.conversationId,
    sentAt: m.sentAt,
    text: m.text ?? "",
    outgoing,
    senderName: incomingSenderName,
    senderAvatarUrl: incomingSenderAvatar,
    attachment,
    replyTo,
    forwardOf,
  };
}

/**
 * Aplica estado às mensagens enviadas por mim (direct API):
 * - read: `sentAt <= peerLastReadAt` → 2 vistos azuis (lido)
 * - sent: preserva quando o servidor indica que não foi entregue ao par
 * - delivered: caso contrário → 2 vistos (entregue, ainda não lido)
 */
/**
 * Ao substituir o histórico pelo GET /messages, mantém bolhas locais de upload
 * (vídeo com progresso) que ainda não existem no servidor.
 */
export function mergeServerMessagesWithPendingUploads(
  serverMessages: ChatMessage[],
  previous: ChatMessage[] | undefined,
): ChatMessage[] {
  if (!previous?.length) return serverMessages;
  const serverIds = new Set(serverMessages.map((m) => m.id));
  const keep = previous.filter((m) => {
    if (serverIds.has(m.id)) return false;
    return (
      m.uploadProgress != null ||
      String(m.id).startsWith("local-upload-") ||
      String(m.id).startsWith("pending-")
    );
  });
  if (!keep.length) return serverMessages;
  const merged = [...serverMessages, ...keep];
  merged.sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  return merged;
}

export function applyOutgoingReceipts(
  messages: ChatMessage[],
  peerLastReadAt: string | null,
): ChatMessage[] {
  const prTime = peerLastReadAt ? new Date(peerLastReadAt).getTime() : null;
  return messages.map((m) => {
    if (!m.outgoing) return m;
    if (m.uploadProgress != null || m.sendFailed || String(m.id).startsWith("pending-")) {
      return m;
    }
    const st = new Date(m.sentAt).getTime();
    if (prTime !== null && !Number.isNaN(prTime) && st <= prTime) {
      return { ...m, outgoingReceipt: "read" as OutgoingReceipt };
    }
    if (m.outgoingReceipt === "sent") return m;
    return { ...m, outgoingReceipt: "delivered" as OutgoingReceipt };
  });
}
