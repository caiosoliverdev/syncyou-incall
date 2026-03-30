import type { ChatMessage } from "@/data/mock-conversation-messages";

/**
 * Corpo para POST /chat/conversations/:id/messages ao encaminhar uma mensagem da API.
 * Replica `kind`, texto, anexo e metadados (figurinha, GIF) e acrescenta `forwardOf`.
 */
export function buildForwardSendBody(
  message: ChatMessage,
  fromConversationName: string,
  forwardedByName: string,
): { kind: string; text?: string; payload?: Record<string, unknown> } {
  if (message.deletedForEveryone) {
    throw new Error("forward_deleted");
  }
  const forwardOf: Record<string, string> = { fromConversationName };
  const by = forwardedByName.trim();
  if (by) forwardOf.forwardedByName = by;
  const att = message.attachment;

  if (!att) {
    return {
      kind: "text",
      ...(message.text.trim() ? { text: message.text.trim() } : {}),
      payload: { forwardOf },
    };
  }

  const payload: Record<string, unknown> = { forwardOf };

  if (att.kind === "image") {
    payload.attachment = {
      kind: "image",
      url: att.url,
      ...(att.alt ? { alt: att.alt } : {}),
      ...(att.asGif ? { asGif: true } : {}),
      ...(att.asSticker ? { asSticker: true } : {}),
    };
    if (att.asSticker && att.captionOnSticker?.text?.trim()) {
      payload.stickerCaption = {
        text: att.captionOnSticker.text.trim(),
        xPercent: att.captionOnSticker.xPercent,
        yPercent: att.captionOnSticker.yPercent,
      };
    }
    return {
      kind: "image",
      text: message.text.trim() ? message.text.trim() : undefined,
      payload,
    };
  }

  if (att.kind === "video") {
    payload.attachment = {
      kind: "video",
      url: att.url,
      ...(att.posterUrl ? { posterUrl: att.posterUrl } : {}),
    };
    return {
      kind: "video",
      text: message.text.trim() ? message.text.trim() : undefined,
      payload,
    };
  }

  if (att.kind === "audio") {
    payload.attachment = { kind: "audio", url: att.url };
    return {
      kind: "audio",
      text: message.text.trim() ? message.text.trim() : undefined,
      payload,
    };
  }

  if (att.kind === "document") {
    if (!att.url?.trim()) {
      throw new Error("forward_no_document_url");
    }
    payload.attachment = {
      kind: "document",
      fileName: att.fileName,
      sizeLabel: att.sizeLabel,
      url: att.url,
    };
    return {
      kind: "document",
      text: message.text.trim() ? message.text.trim() : undefined,
      payload,
    };
  }

  if (att.kind === "contact") {
    payload.attachment = {
      kind: "contact",
      name: att.name,
      ...(att.subtitle ? { subtitle: att.subtitle } : {}),
    };
    return {
      kind: "contact",
      text: message.text.trim() ? message.text.trim() : undefined,
      payload,
    };
  }

  return {
    kind: "text",
    text: message.text.trim() || "Mensagem",
    payload: { forwardOf },
  };
}
