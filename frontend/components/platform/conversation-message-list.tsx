"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useStickToBottom } from "use-stick-to-bottom";
import type { ChatMessage } from "@/data/mock-conversation-messages";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Check, CheckCheck, ChevronDown, Forward, RefreshCw } from "lucide-react";
import { ChatMessageAttachment } from "@/components/platform/chat-message-attachment";
import { LinkPreviewAboveBubble } from "@/components/platform/link-preview-above-bubble";
import { MessageActionsMenu } from "@/components/platform/message-actions-menu";
import {
  MessageText,
  type GroupMentionHandlers,
} from "@/components/platform/message-text";
import { firstHttpUrlInText } from "@/lib/url-in-text";
import { ConversationThreadSkeleton } from "@/components/platform/conversation-thread-skeleton";

type ConversationKind = "direct" | "group";

function formatDayLabel(messageDate: Date, now = new Date()): string {
  const startOf = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const d0 = startOf(messageDate);
  const n0 = startOf(now);
  const diffDays = Math.round((n0 - d0) / 86400000);
  if (diffDays === 0) return "Hoje";
  if (diffDays === 1) return "Ontem";
  if (diffDays < 0) {
    return messageDate.toLocaleDateString("pt-BR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }
  if (messageDate.getFullYear() === now.getFullYear()) {
    return messageDate.toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
  }
  return messageDate.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatMessageTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type TimelineItem =
  | { type: "separator"; key: string; label: string }
  | { type: "message"; message: ChatMessage };

function estimateTimelineItemSize(item: TimelineItem | undefined): number {
  return item?.type === "separator" ? 52 : 84;
}

function getPreviousMessage(
  timeline: TimelineItem[],
  messageIndex: number,
): ChatMessage | null {
  for (let i = messageIndex - 1; i >= 0; i--) {
    const item = timeline[i];
    if (item.type === "message") return item.message;
  }
  return null;
}

/** Primeira mensagem de um bloco do mesmo remetente (grupo, recebidas). */
function isFirstInSenderGroup(
  message: ChatMessage,
  prev: ChatMessage | null,
): boolean {
  if (message.outgoing) return false;
  if (!prev) return true;
  if (prev.outgoing) return true;
  if (dayKey(prev.sentAt) !== dayKey(message.sentAt)) return true;
  const a = prev.senderName?.trim() ?? "";
  const b = message.senderName?.trim() ?? "";
  if (a !== b) return true;
  return false;
}

function senderInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

function SenderAvatar({
  name,
  avatarUrl,
  isDark,
}: {
  name: string;
  avatarUrl?: string | null;
  isDark: boolean;
}) {
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold ${
        isDark ? "bg-zinc-700 text-zinc-200" : "bg-zinc-200 text-zinc-700"
      }`}
      aria-hidden
    >
      {avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        senderInitials(name)
      )}
    </div>
  );
}

function buildTimeline(messages: ChatMessage[]): TimelineItem[] {
  const sorted = [...messages].sort(
    (a, b) => new Date(a.sentAt).getTime() - new Date(b.sentAt).getTime(),
  );
  const items: TimelineItem[] = [];
  let lastKey: string | null = null;
  for (const m of sorted) {
    const key = dayKey(m.sentAt);
    if (key !== lastKey) {
      lastKey = key;
      const label = formatDayLabel(new Date(m.sentAt));
      items.push({ type: "separator", key: `sep-${key}`, label });
    }
    items.push({ type: "message", message: m });
  }
  return items;
}

function DateSeparator({ label, isDark }: { label: string; isDark: boolean }) {
  return (
    <div
      className="flex w-full shrink-0 items-center gap-3 py-3"
      role="separator"
      aria-label={label}
    >
      <div
        className={`h-px min-w-0 flex-1 ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`}
      />
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-center text-[11px] font-semibold shadow-sm ${
          isDark
            ? "bg-zinc-800 text-zinc-300 ring-1 ring-zinc-700"
            : "bg-white text-zinc-600 ring-1 ring-zinc-200"
        }`}
      >
        {label}
      </span>
      <div
        className={`h-px min-w-0 flex-1 ${isDark ? "bg-zinc-700" : "bg-zinc-200"}`}
      />
    </div>
  );
}

const linkClass = (outgoing: boolean, isDark: boolean) =>
  outgoing
    ? isDark
      ? "text-emerald-200 hover:text-emerald-100"
      : "text-emerald-800 hover:text-emerald-900"
    : isDark
      ? "text-sky-400 hover:text-sky-300"
      : "text-blue-600 hover:text-blue-700";

const linkClassOutgoingFailed = (isDark: boolean) =>
  isDark
    ? "text-red-200 underline-offset-2 hover:text-red-100"
    : "text-red-900 underline-offset-2 hover:text-red-950";

/** Distância ao fundo (px) para considerar "no fim" e limpar contador de novas. */
const NEAR_BOTTOM_PX = 100;
/** Distância ao fundo considerada “chegou” (subpixel + virtual). */
const SCROLL_BOTTOM_TOLERANCE_PX = 6;
/** Overlay do skeleton: tempo mínimo visível (ms) antes de revelar a lista. */
const SKELETON_OVERLAY_MIN_MS = 600;
/** Se a pessoa parar de interagir fora do fim da conversa, volta sozinho para o fundo. */
const AUTO_RETURN_TO_BOTTOM_IDLE_MS = 60_000;

/** Evita animação nativa do browser ao saltar para citação / pesquisa. */
function scrollQuotedMessageIntoView(
  scrollRoot: HTMLElement | null,
  quotedMessageId: string,
) {
  if (!scrollRoot || typeof document === "undefined") return;
  let el: Element | null = null;
  try {
    el = scrollRoot.querySelector(`#msg-${CSS.escape(quotedMessageId)}`);
  } catch {
    el = scrollRoot.querySelector(`[id="msg-${quotedMessageId}"]`);
  }
  el?.scrollIntoView({ behavior: "instant", block: "center" });
}

const REPLY_HIGHLIGHT_MS = 2000;

/** TanStack Virtual: saltos para citação / pesquisa — sempre instantâneo. */
const SCROLL_CENTER_INSTANT = { align: "center" as const, behavior: "instant" as const };
/** Lista virtual: alinha o último item ao fundo do viewport (complementa use-stick-to-bottom). */
const SCROLL_END_INSTANT = { align: "end" as const, behavior: "instant" as const };

function ForwardQuoteBlock({
  forwardOf,
  outgoing,
  isDark,
}: {
  forwardOf: NonNullable<ChatMessage["forwardOf"]>;
  outgoing: boolean;
  isDark: boolean;
}) {
  const bar = outgoing
    ? isDark
      ? "border-zinc-400/40 bg-zinc-950/50"
      : "border-zinc-400/60 bg-white/60"
    : isDark
      ? "border-zinc-500 bg-zinc-950/40"
      : "border-zinc-300 bg-zinc-100";

  return (
    <div
      className={`mb-2 flex items-start gap-2 rounded-lg border-l-[3px] px-2 py-1.5 ${bar}`}
    >
      <Forward size={12} className="mt-0.5 shrink-0 opacity-70" aria-hidden />
      <div className="min-w-0">
        <span
          className={`block text-[10px] font-bold tracking-wide uppercase ${
            outgoing
              ? isDark
                ? "text-zinc-400"
                : "text-zinc-600"
              : isDark
                ? "text-zinc-500"
                : "text-zinc-500"
          }`}
        >
          Encaminhada
        </span>
        <span
          className={`mt-0.5 block truncate text-[11px] font-semibold ${
            outgoing
              ? isDark
                ? "text-zinc-200"
                : "text-zinc-800"
              : isDark
                ? "text-zinc-300"
                : "text-zinc-700"
          }`}
        >
          <span className="font-medium opacity-70">De </span>
          {forwardOf.fromConversationName?.trim() || "Conversa"}
        </span>
        {forwardOf.forwardedByName?.trim() ? (
          <span
            className={`mt-0.5 block truncate text-[11px] ${
              outgoing
                ? isDark
                  ? "text-emerald-200/90"
                  : "text-emerald-900/85"
                : isDark
                  ? "text-emerald-400/95"
                  : "text-emerald-800"
            }`}
          >
            <span className="font-medium opacity-80">Por </span>
            <span className="font-semibold">{forwardOf.forwardedByName.trim()}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}

function ReplyQuoteBlock({
  replyTo,
  outgoing,
  isDark,
  onJump,
}: {
  replyTo: NonNullable<ChatMessage["replyTo"]>;
  outgoing: boolean;
  isDark: boolean;
  onJump: () => void;
}) {
  const bar = outgoing
    ? isDark
      ? "border-emerald-300/70 bg-emerald-950/35"
      : "border-emerald-700/50 bg-emerald-950/10"
    : isDark
      ? "border-zinc-500 bg-zinc-950/40"
      : "border-zinc-300 bg-zinc-100";

  return (
    <button
      type="button"
      onClick={onJump}
      className={`mb-2 w-full rounded-lg border-l-[3px] px-2 py-1.5 text-left transition hover:opacity-95 ${bar}`}
    >
      <span
        className={`block text-[11px] font-semibold ${
          outgoing
            ? isDark
              ? "text-emerald-200"
              : "text-emerald-900"
            : isDark
              ? "text-emerald-400"
              : "text-emerald-700"
        }`}
      >
        {replyTo.authorLabel}
      </span>
      <span
        className={`mt-0.5 line-clamp-2 text-[11px] leading-snug ${
          outgoing
            ? isDark
              ? "text-emerald-100/85"
              : "text-emerald-950/75"
            : isDark
              ? "text-zinc-400"
              : "text-zinc-600"
        }`}
      >
        {replyTo.snippet}
      </span>
    </button>
  );
}

function MessageBubble({
  message,
  isDark,
  isGroup,
  showSenderHeader,
  actions,
  onJumpToQuoted,
  highlightQuotedBubble,
  groupMentions,
}: {
  message: ChatMessage;
  isDark: boolean;
  isGroup: boolean;
  showSenderHeader: boolean;
  /** Menu ⋮ ao lado de fora do card; o ancestral da linha deve ter `group`. */
  actions: ReactNode;
  onJumpToQuoted: (quotedMessageId: string) => void;
  /** Destaque temporário só no balão ao saltar para mensagem citada. */
  highlightQuotedBubble?: boolean;
  /** Só conversas em grupo: menções clicáveis e menu de contacto. */
  groupMentions?: GroupMentionHandlers | null;
}) {
  const outgoing = message.outgoing;
  const queuedOutgoing = outgoing && message.queuedOffline === true;
  const failedOutgoing = outgoing && message.sendFailed === true && !queuedOutgoing;
  const groupIncoming = isGroup && !outgoing;
  const senderLabel = message.senderName?.trim();
  const lc = failedOutgoing ? linkClassOutgoingFailed(isDark) : linkClass(outgoing, isDark);
  const hasText = message.text.trim().length > 0;
  const captionOnStickerImage =
    message.attachment?.kind === "image" &&
    message.attachment.asSticker &&
    !!message.attachment.captionOnSticker?.text?.trim();
  const showTextAboveSticker = hasText && !captionOnStickerImage;
  const isRevoked = message.deletedForEveryone === true;
  const stickerSurface =
    !isRevoked &&
    message.attachment?.kind === "image" &&
    message.attachment.asSticker;

  const linkPreviewUrl =
    !isRevoked && hasText ? firstHttpUrlInText(message.text) : null;
  const linkPreviewBlock =
    linkPreviewUrl != null ? (
      <div className="w-max max-w-[48cqw]">
        <LinkPreviewAboveBubble url={linkPreviewUrl} isDark={isDark} outgoing={outgoing} />
      </div>
    ) : null;

  const revokedBubble = (
    <div
      className={`max-w-full rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm ${
        outgoing
          ? isDark
            ? "rounded-br-md bg-emerald-800/90 text-emerald-100"
            : "rounded-br-md bg-emerald-100/90 text-emerald-900"
          : isDark
            ? "rounded-bl-md border border-zinc-700 bg-zinc-800 text-zinc-400"
            : "rounded-bl-md border border-zinc-200 bg-white text-zinc-500"
      }`}
    >
      <p className="text-center text-sm italic">Mensagem apagada</p>
      <div
        className={`mt-1 flex items-center justify-end text-[10px] tabular-nums ${
          outgoing
            ? isDark
              ? "text-emerald-200/75"
              : "text-emerald-900/55"
            : isDark
              ? "text-zinc-500"
              : "text-zinc-500"
        }`}
      >
        <time dateTime={message.sentAt}>{formatMessageTime(message.sentAt)}</time>
      </div>
    </div>
  );

  const innerStandardBubble = (
    <div
      className={`max-w-full rounded-2xl px-3 py-2 text-sm leading-snug shadow-sm ${
        outgoing
          ? failedOutgoing
            ? isDark
              ? "rounded-br-md border border-red-500/75 bg-red-950/95 text-red-50"
              : "rounded-br-md border border-red-300 bg-red-50 text-red-950"
            : queuedOutgoing
              ? isDark
                ? "rounded-br-md border border-amber-500/60 bg-amber-950/90 text-amber-50"
                : "rounded-br-md border border-amber-300 bg-amber-50 text-amber-950"
              : isDark
                ? "rounded-br-md bg-emerald-800 text-emerald-50"
                : "rounded-br-md bg-emerald-100 text-emerald-950"
          : isDark
            ? "rounded-bl-md border border-zinc-700 bg-zinc-800 text-zinc-100"
            : "rounded-bl-md border border-zinc-200 bg-white text-zinc-900"
      }`}
    >
      {message.forwardOf ? (
        <ForwardQuoteBlock forwardOf={message.forwardOf} outgoing={outgoing} isDark={isDark} />
      ) : null}
      {message.replyTo ? (
        <ReplyQuoteBlock
          replyTo={message.replyTo}
          outgoing={outgoing}
          isDark={isDark}
          onJump={() => onJumpToQuoted(message.replyTo!.id)}
        />
      ) : null}
      {message.attachment ? (
        <div className={hasText ? "mb-2" : ""}>
          <ChatMessageAttachment
            attachment={message.attachment}
            isDark={isDark}
            outgoing={outgoing}
            uploadProgress={message.uploadProgress}
          />
        </div>
      ) : null}
      {hasText ? (
        <div className="m-0">
          <MessageText
            text={message.text}
            linkClassName={lc}
            isDark={isDark}
            groupMentions={isGroup ? groupMentions ?? null : null}
            outgoingBubble={outgoing}
            bubbleFailed={failedOutgoing}
          />
        </div>
      ) : null}
      <div
        className={`mt-1 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
          failedOutgoing
            ? isDark
              ? "text-red-200/85"
              : "text-red-900/65"
            : queuedOutgoing
              ? isDark
                ? "text-amber-200/85"
                : "text-amber-900/70"
              : outgoing
              ? isDark
                ? "text-emerald-200/80"
                : "text-emerald-900/60"
              : isDark
                ? "text-zinc-500"
                : "text-zinc-500"
        }`}
      >
        <time dateTime={message.sentAt}>{formatMessageTime(message.sentAt)}</time>
        {queuedOutgoing ? (
          <span
            className={`text-[10px] font-medium ${isDark ? "text-amber-200/90" : "text-amber-900"}`}
          >
            Sem rede
          </span>
        ) : null}
        {failedOutgoing ? (
          <span
            className={`text-[10px] font-medium ${isDark ? "text-red-300/90" : "text-red-800"}`}
          >
            Falhou
          </span>
        ) : null}
        {outgoing && message.uploadProgress != null ? (
          <span
            className={`inline-flex shrink-0 items-center font-mono text-[10px] tabular-nums ${
              isDark ? "text-emerald-200/90" : "text-emerald-900/70"
            }`}
            title="Envio do ficheiro"
          >
            {message.uploadProgress}%
          </span>
        ) : null}
        {outgoing &&
        message.uploadProgress == null &&
        !failedOutgoing &&
        !queuedOutgoing &&
        message.outgoingReceipt ? (
          <span
            className="inline-flex shrink-0 items-center"
            title={
              message.outgoingReceipt === "read"
                ? "Enviado, entregue e lido"
                : message.outgoingReceipt === "delivered"
                  ? "Enviado e entregue"
                  : "Enviado"
            }
          >
            {message.outgoingReceipt === "read" ? (
              <CheckCheck
                size={14}
                strokeWidth={2.5}
                className={isDark ? "text-sky-300" : "text-sky-600"}
                aria-label="Enviado, entregue e lido"
              />
            ) : message.outgoingReceipt === "delivered" ? (
              <CheckCheck
                size={14}
                strokeWidth={2.5}
                className={
                  isDark ? "text-emerald-100/75" : "text-emerald-900/55"
                }
                aria-label="Enviado e entregue"
              />
            ) : (
              <Check
                size={14}
                strokeWidth={2.5}
                className={isDark ? "text-emerald-200/70" : "text-emerald-900/50"}
                aria-label="Enviado"
              />
            )}
          </span>
        ) : null}
      </div>
    </div>
  );

  const stickerLayout =
    stickerSurface && message.attachment ? (
      <div
        className={`flex w-full max-w-[min(280px,48cqw)] flex-col gap-1.5 ${
          failedOutgoing && outgoing
            ? isDark
              ? "rounded-2xl border border-red-500/75 bg-red-950/90 p-2 shadow-sm"
              : "rounded-2xl border border-red-300 bg-red-50/95 p-2 shadow-sm"
            : queuedOutgoing && outgoing
              ? isDark
                ? "rounded-2xl border border-amber-500/60 bg-amber-950/90 p-2 shadow-sm"
                : "rounded-2xl border border-amber-300 bg-amber-50/95 p-2 shadow-sm"
              : ""
        }`}
      >
        {message.forwardOf ? (
          <ForwardQuoteBlock forwardOf={message.forwardOf} outgoing={outgoing} isDark={isDark} />
        ) : null}
        {message.replyTo ? (
          <ReplyQuoteBlock
            replyTo={message.replyTo}
            outgoing={outgoing}
            isDark={isDark}
            onJump={() => onJumpToQuoted(message.replyTo!.id)}
          />
        ) : null}
        {showTextAboveSticker ? (
          <div className="px-0.5 text-center text-sm leading-snug">
            <MessageText
              text={message.text}
              linkClassName={lc}
              isDark={isDark}
              groupMentions={isGroup ? groupMentions ?? null : null}
              outgoingBubble={outgoing}
              bubbleFailed={failedOutgoing}
            />
          </div>
        ) : null}
        <ChatMessageAttachment
          attachment={message.attachment}
          isDark={isDark}
          outgoing={outgoing}
          uploadProgress={message.uploadProgress}
        />
        <div
          className={`flex items-center justify-end gap-1 text-[10px] tabular-nums ${
            failedOutgoing
              ? isDark
                ? "text-red-200/85"
                : "text-red-900/65"
              : queuedOutgoing
                ? isDark
                  ? "text-amber-200/85"
                  : "text-amber-900/70"
                : outgoing
                  ? isDark
                    ? "text-emerald-200/80"
                    : "text-emerald-900/60"
                  : isDark
                    ? "text-zinc-500"
                    : "text-zinc-500"
          }`}
        >
          <time dateTime={message.sentAt}>{formatMessageTime(message.sentAt)}</time>
          {queuedOutgoing ? (
            <span
              className={`text-[10px] font-medium ${isDark ? "text-amber-200/90" : "text-amber-900"}`}
            >
              Sem rede
            </span>
          ) : null}
          {failedOutgoing ? (
            <span
              className={`text-[10px] font-medium ${isDark ? "text-red-300/90" : "text-red-800"}`}
            >
              Falhou
            </span>
          ) : null}
          {outgoing && message.uploadProgress != null ? (
            <span
              className={`inline-flex shrink-0 items-center font-mono text-[10px] tabular-nums ${
                isDark ? "text-emerald-200/90" : "text-emerald-900/70"
              }`}
              title="Envio do ficheiro"
            >
              {message.uploadProgress}%
            </span>
          ) : null}
          {outgoing &&
          message.uploadProgress == null &&
          !failedOutgoing &&
          !queuedOutgoing &&
          message.outgoingReceipt ? (
            <span
              className="inline-flex shrink-0 items-center"
              title={
                message.outgoingReceipt === "read"
                  ? "Enviado, entregue e lido"
                  : message.outgoingReceipt === "delivered"
                    ? "Enviado e entregue"
                    : "Enviado"
              }
            >
              {message.outgoingReceipt === "read" ? (
                <CheckCheck
                  size={14}
                  strokeWidth={2.5}
                  className={isDark ? "text-sky-300" : "text-sky-600"}
                  aria-label="Enviado, entregue e lido"
                />
              ) : message.outgoingReceipt === "delivered" ? (
                <CheckCheck
                  size={14}
                  strokeWidth={2.5}
                  className={
                    isDark ? "text-emerald-100/75" : "text-emerald-900/55"
                  }
                  aria-label="Enviado e entregue"
                />
              ) : (
                <Check
                  size={14}
                  strokeWidth={2.5}
                  className={isDark ? "text-emerald-200/70" : "text-emerald-900/50"}
                  aria-label="Enviado"
                />
              )}
            </span>
          ) : null}
        </div>
      </div>
    ) : null;

  const bubbleBody = isRevoked ? revokedBubble : stickerLayout ?? innerStandardBubble;

  const bubbleHighlightClass =
    highlightQuotedBubble === true
      ? isDark
        ? "rounded-2xl ring-2 ring-emerald-400/90 ring-offset-2 ring-offset-zinc-950 transition-[box-shadow,ring-color] duration-300"
        : "rounded-2xl ring-2 ring-emerald-600/85 ring-offset-2 ring-offset-zinc-50 transition-[box-shadow,ring-color] duration-300"
      : "";

  const bubbleContent =
    bubbleHighlightClass !== "" ? (
      <div className={`w-max max-w-full ${bubbleHighlightClass}`}>{bubbleBody}</div>
    ) : (
      bubbleBody
    );

  const bubbleShell = (child: ReactNode, align: "end" | "start") => (
    <div
      className={`flex w-full shrink-0 items-end gap-1 ${
        align === "end" ? "justify-end" : "justify-start"
      }`}
    >
      {align === "end" ? (
        <>
          <div className="flex shrink-0 self-end pb-1">{actions}</div>
          <div className="min-w-0 w-max max-w-[48cqw]">{child}</div>
        </>
      ) : (
        <>
          <div className="min-w-0 w-max max-w-[48cqw]">{child}</div>
          <div className="flex shrink-0 self-end pb-1">{actions}</div>
        </>
      )}
    </div>
  );

  const withLinkPreview = (inner: ReactNode, align: "end" | "start") => {
    if (!linkPreviewBlock) return inner;
    return (
      <div
        className={`flex w-full flex-col gap-1.5 ${align === "end" ? "items-end" : "items-start"}`}
      >
        {linkPreviewBlock}
        {inner}
      </div>
    );
  };

  if (outgoing) {
    return withLinkPreview(bubbleShell(bubbleContent, "end"), "end");
  }

  if (groupIncoming) {
    return (
      <div className="flex w-full shrink-0 justify-start">
        <div className="flex w-full min-w-0 gap-2">
          <div className="flex w-9 shrink-0 flex-col items-center pt-0.5">
            {showSenderHeader ? (
              <SenderAvatar
                name={senderLabel || "?"}
                avatarUrl={message.senderAvatarUrl}
                isDark={isDark}
              />
            ) : (
              <div className="h-9 w-9 shrink-0" aria-hidden />
            )}
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-stretch">
            {showSenderHeader && senderLabel ? (
              <span
                className={`mb-0.5 text-xs font-semibold ${
                  isDark ? "text-emerald-400" : "text-emerald-700"
                }`}
              >
                {senderLabel}
              </span>
            ) : null}
            {linkPreviewBlock}
            <div className="flex items-end gap-1">
              <div className="min-w-0 w-max max-w-[48cqw]">{bubbleContent}</div>
              <div className="flex shrink-0 self-end pb-1">{actions}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return withLinkPreview(bubbleShell(bubbleContent, "start"), "start");
}

type ConversationMessageListProps = {
  isDark: boolean;
  conversationId: string;
  conversationKind: ConversationKind;
  /** Historico da conversa (estado na pagina + mocks). */
  messages: ChatMessage[];
  /** API sem cache: mostra skeleton em vez de lista vazia + rolagem. */
  loadingSkeleton?: boolean;
  /** Overlay de skeleton por cima da lista até o scroll inicial estabilizar (lista monta por baixo). */
  scrollSettlingOverlay?: boolean;
  /** Chamado uma vez quando o scroll ao fundo está pronto (ou thread vazia). */
  onInitialScrollSettled?: () => void;
  /** Quando muda, forca rolagem ao fim (ex.: painel de chat recém-aberto). */
  scrollToBottomKey?: number | string;
  onReply?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  onCopy?: (message: ChatMessage) => void;
  onDeleteForMe?: (message: ChatMessage) => void;
  onDeleteForEveryone?: (message: ChatMessage) => void;
  onFavoriteSticker?: (message: ChatMessage) => void;
  /** Reenviar mensagem de texto cujo envio falhou. */
  onResendFailedMessage?: (message: ChatMessage) => void;
  /** Menções em grupo: estilo link e menu (amigo / não amigo). */
  groupMentions?: GroupMentionHandlers | null;
  /** Grupo: pedido para saltar a uma mensagem (ex.: menção); `requestKey` incrementa a cada clique. */
  jumpToMessageRequest?: { messageId: string; requestKey: number } | null;
  onJumpToMessageHandled?: () => void;
  /** Pesquisa na conversa: saltar e realçar a mensagem (mesmo fluxo que menção). */
  searchJumpRequest?: { messageId: string; requestKey: number } | null;
  onSearchJumpHandled?: () => void;
};

export function ConversationMessageList({
  isDark,
  conversationId,
  conversationKind,
  messages: messagesProp,
  loadingSkeleton = false,
  scrollSettlingOverlay = false,
  onInitialScrollSettled,
  scrollToBottomKey,
  onReply,
  onForward,
  onCopy,
  onDeleteForMe,
  onDeleteForEveryone,
  onFavoriteSticker,
  onResendFailedMessage,
  groupMentions,
  jumpToMessageRequest,
  onJumpToMessageHandled,
  searchJumpRequest,
  onSearchJumpHandled,
}: ConversationMessageListProps) {
  const {
    scrollRef: stickScrollRef,
    contentRef: stickContentRef,
    scrollToBottom,
    stopScroll,
  } = useStickToBottom({
    /** Carregamento inicial e redimensionamentos: sem animação (evita “filme” a passar por todas as mensagens). */
    initial: "instant",
    resize: "instant",
  });

  const replyHighlightTimerRef = useRef<number | null>(null);
  const autoReturnToBottomTimerRef = useRef<number | null>(null);
  const lastMentionJumpKeySucceededRef = useRef(0);
  const lastSearchJumpKeySucceededRef = useRef(0);
  const [replyHighlightId, setReplyHighlightId] = useState<string | null>(null);
  const prevConvIdRef = useRef(conversationId);
  const prevMessagesRef = useRef<ChatMessage[]>([]);
  const isNearBottomRef = useRef(true);
  const lastScrolledOutgoingIdRef = useRef<string | null>(null);
  const [pendingBelow, setPendingBelow] = useState(0);
  const lastProcessedScrollToBottomKeyRef = useRef<number | string | undefined>(undefined);
  const prevLoadingSkeletonRef = useRef(loadingSkeleton);
  const scrollSettleReportedRef = useRef(false);
  const timeline = useMemo(() => buildTimeline(messagesProp), [messagesProp]);
  const estimatedInitialOffset = useMemo(
    () =>
      Math.max(
        0,
        timeline.reduce((sum, item) => sum + estimateTimelineItemSize(item), 0),
      ),
    [timeline],
  );

  const rowVirtualizer = useVirtualizer({
    count: timeline.length,
    getScrollElement: () => stickScrollRef.current,
    estimateSize: (index) => estimateTimelineItemSize(timeline[index]),
    getItemKey: (index) =>
      timeline[index]?.type === "separator"
        ? timeline[index]!.key
        : timeline[index]?.message.id ?? `row-${index}`,
    initialOffset: estimatedInitialOffset,
    overscan: 10,
  });

  /** Virtualizer + stick-to-bottom: o fundo só fica certo depois de `getTotalSize`/medidas; `scrollToIndex` sincroniza o range. */
  const scrollListToBottom = useCallback(() => {
    const lastIdx = timeline.length - 1;
    if (lastIdx >= 0) {
      rowVirtualizer.scrollToIndex(lastIdx, SCROLL_END_INSTANT);
    }
    void scrollToBottom({ animation: "instant" });
    requestAnimationFrame(() => {
      if (lastIdx >= 0) {
        rowVirtualizer.scrollToIndex(lastIdx, SCROLL_END_INSTANT);
      }
      void scrollToBottom({ animation: "instant" });
      const el = stickScrollRef.current;
      if (el) {
        el.scrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      }
      requestAnimationFrame(() => {
        const box = stickScrollRef.current;
        if (box) {
          box.scrollTop = Math.max(0, box.scrollHeight - box.clientHeight);
        }
      });
    });
  }, [timeline.length, rowVirtualizer, scrollToBottom, stickScrollRef]);

  const jumpToQuotedMessage = useCallback(
    (scrollRoot: HTMLElement | null, quotedMessageId: string) => {
      stopScroll();
      if (replyHighlightTimerRef.current != null) {
        window.clearTimeout(replyHighlightTimerRef.current);
        replyHighlightTimerRef.current = null;
      }
      const idx = timeline.findIndex(
        (it) => it.type === "message" && it.message.id === quotedMessageId,
      );
      if (idx >= 0) {
        rowVirtualizer.scrollToIndex(idx, SCROLL_CENTER_INSTANT);
        window.requestAnimationFrame(() => {
          rowVirtualizer.scrollToIndex(idx, SCROLL_CENTER_INSTANT);
          scrollQuotedMessageIntoView(scrollRoot, quotedMessageId);
        });
      } else {
        scrollQuotedMessageIntoView(scrollRoot, quotedMessageId);
      }
      setReplyHighlightId(quotedMessageId);
      replyHighlightTimerRef.current = window.setTimeout(() => {
        setReplyHighlightId(null);
        replyHighlightTimerRef.current = null;
      }, REPLY_HIGHLIGHT_MS);
    },
    [timeline, rowVirtualizer, stopScroll],
  );

  const handleJumpToQuoted = useCallback(
    (quotedId: string) => {
      jumpToQuotedMessage(stickScrollRef.current, quotedId);
    },
    [jumpToQuotedMessage, stickScrollRef],
  );

  useEffect(() => {
    lastMentionJumpKeySucceededRef.current = 0;
    lastSearchJumpKeySucceededRef.current = 0;
  }, [conversationId]);

  useEffect(() => {
    if (!jumpToMessageRequest) {
      lastMentionJumpKeySucceededRef.current = 0;
      return;
    }
    if (jumpToMessageRequest.requestKey === 0) return;
    const { messageId, requestKey } = jumpToMessageRequest;
    if (requestKey <= lastMentionJumpKeySucceededRef.current) return;
    if (!messagesProp.some((m) => m.id === messageId)) return;
    lastMentionJumpKeySucceededRef.current = requestKey;
    jumpToQuotedMessage(stickScrollRef.current, messageId);
    onJumpToMessageHandled?.();
  }, [jumpToMessageRequest, messagesProp, jumpToQuotedMessage, onJumpToMessageHandled, stickScrollRef]);

  useEffect(() => {
    if (!searchJumpRequest) {
      lastSearchJumpKeySucceededRef.current = 0;
      return;
    }
    if (searchJumpRequest.requestKey === 0) return;
    const { messageId, requestKey } = searchJumpRequest;
    if (requestKey <= lastSearchJumpKeySucceededRef.current) return;
    if (!messagesProp.some((m) => m.id === messageId)) return;
    lastSearchJumpKeySucceededRef.current = requestKey;
    jumpToQuotedMessage(stickScrollRef.current, messageId);
    onSearchJumpHandled?.();
  }, [searchJumpRequest, messagesProp, jumpToQuotedMessage, onSearchJumpHandled, stickScrollRef]);

  useEffect(() => {
    setReplyHighlightId(null);
    if (replyHighlightTimerRef.current != null) {
      window.clearTimeout(replyHighlightTimerRef.current);
      replyHighlightTimerRef.current = null;
    }
  }, [conversationId]);

  useEffect(
    () => () => {
      if (replyHighlightTimerRef.current != null) {
        window.clearTimeout(replyHighlightTimerRef.current);
      }
      if (autoReturnToBottomTimerRef.current != null) {
        window.clearTimeout(autoReturnToBottomTimerRef.current);
      }
    },
    [],
  );

  const clearAutoReturnToBottomTimer = useCallback(() => {
    if (autoReturnToBottomTimerRef.current != null) {
      window.clearTimeout(autoReturnToBottomTimerRef.current);
      autoReturnToBottomTimerRef.current = null;
    }
  }, []);

  const scheduleAutoReturnToBottom = useCallback(() => {
    clearAutoReturnToBottomTimer();
    autoReturnToBottomTimerRef.current = window.setTimeout(() => {
      autoReturnToBottomTimerRef.current = null;
      if (isNearBottomRef.current) return;
      scrollListToBottom();
      setPendingBelow(0);
      isNearBottomRef.current = true;
    }, AUTO_RETURN_TO_BOTTOM_IDLE_MS);
  }, [clearAutoReturnToBottomTimer, scrollListToBottom]);

  const handleScroll = useCallback(() => {
    const el = stickScrollRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = dist <= NEAR_BOTTOM_PX;
    isNearBottomRef.current = near;
    if (near) {
      clearAutoReturnToBottomTimer();
      setPendingBelow(0);
      return;
    }
    scheduleAutoReturnToBottom();
  }, [clearAutoReturnToBottomTimer, scheduleAutoReturnToBottom, stickScrollRef]);

  /** Ex.: abrir chat na chamada — força ir ao fundo (só quando a chave muda, não quando a timeline cresce). */
  useLayoutEffect(() => {
    if (scrollToBottomKey === undefined) return;
    if (lastProcessedScrollToBottomKeyRef.current === scrollToBottomKey) return;
    lastProcessedScrollToBottomKeyRef.current = scrollToBottomKey;
    if (timeline.length === 0) return;
    scrollListToBottom();
    setPendingBelow(0);
    isNearBottomRef.current = true;
  }, [scrollToBottomKey, scrollListToBottom, timeline.length]);

  useLayoutEffect(() => {
    const endedSkeleton =
      prevLoadingSkeletonRef.current && !loadingSkeleton && messagesProp.length > 0;
    prevLoadingSkeletonRef.current = loadingSkeleton;

    if (loadingSkeleton) {
      clearAutoReturnToBottomTimer();
      prevMessagesRef.current = [];
      return;
    }

    if (!stickScrollRef.current) return;

    if (prevConvIdRef.current !== conversationId) {
      prevConvIdRef.current = conversationId;
      prevMessagesRef.current = [];
      prevLoadingSkeletonRef.current = false;
      lastScrolledOutgoingIdRef.current = null;
      clearAutoReturnToBottomTimer();
      setPendingBelow(0);
      isNearBottomRef.current = true;
    }

    const prev = prevMessagesRef.current;
    const prevLen = prev.length;
    const next = messagesProp;
    const nextLen = next.length;

    if (nextLen === 0) {
      prevMessagesRef.current = next;
      return;
    }

    /** Primeira pintura após skeleton ou histórico inicial — use-stick-to-bottom + virtual. */
    if (endedSkeleton && nextLen > 0) {
      prevMessagesRef.current = next;
      isNearBottomRef.current = true;
      setPendingBelow(0);
      scrollListToBottom();
      return;
    }

    if (prevLen === 0 && nextLen > 0) {
      prevMessagesRef.current = next;
      scrollListToBottom();
      return;
    }

    const appended = nextLen > prevLen;
    const last = next[nextLen - 1];

    if (appended && last) {
      if (last.outgoing) {
        prevMessagesRef.current = next;
        setPendingBelow(0);
        isNearBottomRef.current = true;
        return;
      }
      if (isNearBottomRef.current) {
        prevMessagesRef.current = next;
        setPendingBelow(0);
        scrollListToBottom();
        return;
      }
      setPendingBelow((c) => c + (nextLen - prevLen));
    }

    prevMessagesRef.current = next;
  }, [
    clearAutoReturnToBottomTimer,
    messagesProp,
    conversationId,
    loadingSkeleton,
    timeline.length,
    scrollListToBottom,
    stickScrollRef,
  ]);

  /** Mensagem enviada por mim — instantâneo; resize do conteúdo também é tratado pela lib. */
  useEffect(() => {
    const next = messagesProp;
    if (next.length === 0) return;
    const last = next[next.length - 1];
    if (!last.outgoing) return;
    if (lastScrolledOutgoingIdRef.current === last.id) return;
    lastScrolledOutgoingIdRef.current = last.id;
    scrollListToBottom();
  }, [messagesProp, scrollListToBottom]);

  const scrollToBottomAndClear = useCallback(() => {
    clearAutoReturnToBottomTimer();
    scrollListToBottom();
    setPendingBelow(0);
    isNearBottomRef.current = true;
  }, [clearAutoReturnToBottomTimer, scrollListToBottom]);

  useLayoutEffect(() => {
    if (!onInitialScrollSettled) return;
    if (scrollSettleReportedRef.current) return;
    if (loadingSkeleton) return;
    if (messagesProp.length === 0) return;
    scrollListToBottom();
  }, [
    loadingSkeleton,
    messagesProp.length,
    conversationId,
    onInitialScrollSettled,
    scrollListToBottom,
  ]);

  /** Skeleton overlay: só remove quando o scroll está mesmo no fundo (altura virtual pode crescer várias vezes). */
  useEffect(() => {
    if (!onInitialScrollSettled) return;
    if (scrollSettleReportedRef.current) return;
    if (loadingSkeleton) return;
    if (messagesProp.length === 0) {
      scrollSettleReportedRef.current = true;
      onInitialScrollSettled();
      return;
    }

    let cancelled = false;
    let rafId = 0;
    let minDelayTimeoutId = 0;
    let stableFrames = 0;
    const STABLE_FRAMES = 2;
    const MAX_FRAMES = 300;
    const startedAt = Date.now();
    let scrollSettled = false;

    const finish = () => {
      if (cancelled || scrollSettleReportedRef.current) return;
      scrollSettleReportedRef.current = true;
      onInitialScrollSettled();
    };

    /** Só remove overlay depois do scroll estar pronto e de decorrer o tempo mínimo (2s). */
    const tryFinishAfterMinDelay = () => {
      if (cancelled || scrollSettleReportedRef.current || !scrollSettled) return;
      const elapsed = Date.now() - startedAt;
      if (elapsed < SKELETON_OVERLAY_MIN_MS) {
        if (minDelayTimeoutId) window.clearTimeout(minDelayTimeoutId);
        minDelayTimeoutId = window.setTimeout(() => {
          minDelayTimeoutId = 0;
          tryFinishAfterMinDelay();
        }, SKELETON_OVERLAY_MIN_MS - elapsed);
        return;
      }
      finish();
    };

    const isAtBottom = (el: HTMLElement) => {
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      return dist <= SCROLL_BOTTOM_TOLERANCE_PX;
    };

    const ro = new ResizeObserver(() => {
      if (cancelled) return;
      stableFrames = 0;
      scrollListToBottom();
    });

    let contentObserved = false;
    const ensureContentObserved = () => {
      if (contentObserved) return;
      const c = stickContentRef.current;
      if (c) {
        ro.observe(c);
        contentObserved = true;
      }
    };

    const tick = (frame: number) => {
      if (cancelled) return;
      ensureContentObserved();
      const el = stickScrollRef.current;
      if (!el) {
        if (frame >= MAX_FRAMES) {
          scrollSettled = true;
          tryFinishAfterMinDelay();
        } else rafId = requestAnimationFrame(() => tick(frame + 1));
        return;
      }
      scrollListToBottom();
      /** `scrollListToBottom` aplica scrollTop no rAF interno — medir no frame seguinte. */
      rafId = requestAnimationFrame(() => {
        if (cancelled) return;
        const box = stickScrollRef.current;
        if (!box) {
          if (frame >= MAX_FRAMES) {
            scrollSettled = true;
            tryFinishAfterMinDelay();
          } else rafId = requestAnimationFrame(() => tick(frame + 1));
          return;
        }
        if (isAtBottom(box)) {
          stableFrames++;
          if (stableFrames >= STABLE_FRAMES) {
            scrollSettled = true;
            tryFinishAfterMinDelay();
            return;
          }
        } else {
          stableFrames = 0;
        }
        if (frame >= MAX_FRAMES) {
          scrollSettled = true;
          tryFinishAfterMinDelay();
          return;
        }
        rafId = requestAnimationFrame(() => tick(frame + 1));
      });
    };

    scrollListToBottom();
    rafId = requestAnimationFrame(() => tick(0));

    return () => {
      cancelled = true;
      cancelAnimationFrame(rafId);
      if (minDelayTimeoutId) window.clearTimeout(minDelayTimeoutId);
      ro.disconnect();
    };
  }, [
    loadingSkeleton,
    messagesProp.length,
    conversationId,
    onInitialScrollSettled,
    scrollListToBottom,
    stickScrollRef,
  ]);

  if (loadingSkeleton) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ConversationThreadSkeleton isDark={isDark} variant="chat" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={stickScrollRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Historico de mensagens"
        onScroll={handleScroll}
        style={{
          scrollBehavior: "auto",
          visibility: scrollSettlingOverlay ? "hidden" : "visible",
        }}
        className={`flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overflow-anchor-none px-3 py-2 transition-none ${
          isDark ? "bg-zinc-950" : "bg-zinc-50"
        }`}
      >
        <div
          ref={stickContentRef}
          className="@container relative w-full min-w-0 pb-2"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const index = virtualRow.index;
            const item = timeline[index];
            if (!item) return null;
            if (item.type === "separator") {
              return (
                <div
                  key={virtualRow.key}
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                  className="absolute top-0 left-0 w-full pb-1"
                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                >
                  <DateSeparator label={item.label} isDark={isDark} />
                </div>
              );
            }
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                id={`msg-${item.message.id}`}
                className="group absolute top-0 left-0 flex w-full shrink-0 pb-1"
                style={{ transform: `translateY(${virtualRow.start}px)` }}
              >
                <MessageBubble
                  message={item.message}
                  isDark={isDark}
                  isGroup={conversationKind === "group"}
                  showSenderHeader={isFirstInSenderGroup(
                    item.message,
                    getPreviousMessage(timeline, index),
                  )}
                  onJumpToQuoted={handleJumpToQuoted}
                  highlightQuotedBubble={replyHighlightId === item.message.id}
                  groupMentions={groupMentions}
                  actions={
                    <>
                      {(item.message.sendFailed || item.message.queuedOffline) &&
                      item.message.outgoing &&
                      onResendFailedMessage ? (
                        <Tooltip.Root delayDuration={200}>
                          <Tooltip.Trigger asChild>
                            <button
                              type="button"
                              aria-label="Reenviar mensagem"
                              onClick={(e) => {
                                e.stopPropagation();
                                onResendFailedMessage(item.message);
                              }}
                              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity duration-150 focus:outline-none focus-visible:opacity-100 group-hover:opacity-100 ${
                                isDark
                                  ? "text-red-300 hover:bg-red-950/80"
                                  : "text-red-700 hover:bg-red-100/90"
                              }`}
                            >
                              <RefreshCw size={16} strokeWidth={2.25} />
                            </button>
                          </Tooltip.Trigger>
                          <Tooltip.Portal>
                            <Tooltip.Content
                              side="top"
                              sideOffset={6}
                              className={`z-[450] max-w-[14rem] rounded-md px-2 py-1.5 text-xs font-medium shadow-md ${
                                isDark
                                  ? "bg-zinc-800 text-zinc-100"
                                  : "bg-zinc-900 text-white"
                              }`}
                            >
                              Reenviar mensagem
                              <Tooltip.Arrow
                                className={isDark ? "fill-zinc-800" : "fill-zinc-900"}
                              />
                            </Tooltip.Content>
                          </Tooltip.Portal>
                        </Tooltip.Root>
                      ) : null}
                      <MessageActionsMenu
                        isDark={isDark}
                        message={item.message}
                        hasText={item.message.text.trim().length > 0}
                        onReply={() => onReply?.(item.message)}
                        onForward={() => onForward?.(item.message)}
                        onCopy={() => {
                          const t = item.message.text.trim();
                          if (t) void navigator.clipboard.writeText(t);
                          onCopy?.(item.message);
                        }}
                        onDeleteForMe={() => onDeleteForMe?.(item.message)}
                        onDeleteForEveryone={() =>
                          onDeleteForEveryone?.(item.message)
                        }
                        onFavoriteSticker={
                          onFavoriteSticker
                            ? () => onFavoriteSticker(item.message)
                            : undefined
                        }
                      />
                    </>
                  }
                />
              </div>
            );
          })}
        </div>
      </div>

      {scrollSettlingOverlay ? (
        <div
          className="pointer-events-none absolute inset-0 z-30 flex min-h-0 flex-col"
          aria-hidden
        >
          <ConversationThreadSkeleton isDark={isDark} variant="chat" />
        </div>
      ) : null}

      {pendingBelow > 0 ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
          <button
            type="button"
            onClick={scrollToBottomAndClear}
            className={`pointer-events-auto inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-lg transition hover:opacity-95 ${
              isDark
                ? "border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                : "border-zinc-200 bg-white text-zinc-900 hover:bg-zinc-50"
            }`}
          >
            <span
              className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] ${
                isDark ? "bg-emerald-600 text-white" : "bg-emerald-600 text-white"
              }`}
            >
              {pendingBelow > 99 ? "99+" : pendingBelow}
            </span>
            <span className="max-sm:hidden">mensagens novas</span>
            <ChevronDown size={14} className="opacity-80" aria-hidden />
          </button>
        </div>
      ) : null}
    </div>
  );
}
