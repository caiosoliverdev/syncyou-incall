"use client";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useState } from "react";
import { Copy, Forward, MoreVertical, Reply, Star, Trash2 } from "lucide-react";
import type { ChatMessage } from "@/data/mock-conversation-messages";

const DELETE_FOR_EVERYONE_MS = 10 * 60 * 1000;

export function canDeleteForEveryone(message: ChatMessage): boolean {
  if (message.deletedForEveryone) return false;
  if (!message.outgoing) return false;
  const age = Date.now() - new Date(message.sentAt).getTime();
  return age >= 0 && age <= DELETE_FOR_EVERYONE_MS;
}

type DeleteMessageDialogProps = {
  open: boolean;
  isDark: boolean;
  showDeleteForEveryone: boolean;
  onClose: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
};

function DeleteMessageDialog({
  open,
  isDark,
  showDeleteForEveryone,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
}: DeleteMessageDialogProps) {
  if (!open) return null;

  const panel = isDark
    ? "border-zinc-600 bg-zinc-900 text-zinc-100"
    : "border-zinc-300 bg-white text-zinc-900";
  const muted = isDark ? "text-zinc-400" : "text-zinc-600";
  const cancelBtn = isDark
    ? "border-zinc-600 bg-zinc-800 hover:bg-zinc-700 text-zinc-100"
    : "border-zinc-300 bg-zinc-100 hover:bg-zinc-200 text-zinc-900";
  const dangerOutline = isDark
    ? "border-red-500/50 bg-red-950/40 text-red-300 hover:bg-red-950/70"
    : "border-red-200 bg-red-50 text-red-700 hover:bg-red-100";

  return (
    <div
      className="fixed inset-0 z-[420] flex items-center justify-center bg-black/55 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-msg-dialog-title"
        className={`w-full max-w-sm rounded-xl border p-4 shadow-2xl ${panel}`}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              isDark ? "bg-red-500/20 text-red-300" : "bg-red-100 text-red-600"
            }`}
          >
            <Trash2 size={18} />
          </div>
          <div className="min-w-0">
            <h3 id="delete-msg-dialog-title" className="text-base font-semibold">
              Apagar mensagem
            </h3>
            <p className={`mt-1 text-sm ${muted}`}>
              {showDeleteForEveryone
                ? "Escolha entre apagar só para você ou para todos na conversa."
                : "A mensagem será removida apenas para você."}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${dangerOutline}`}
            onClick={() => {
              onDeleteForMe();
              onClose();
            }}
          >
            Apagar para você
          </button>
          {showDeleteForEveryone ? (
            <button
              type="button"
              className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${dangerOutline}`}
              onClick={() => {
                onDeleteForEveryone();
                onClose();
              }}
            >
              Apagar para todos
            </button>
          ) : null}
          <button
            type="button"
            className={`w-full cursor-pointer rounded-lg border px-3 py-2.5 text-sm font-semibold transition ${cancelBtn}`}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export function isStickerAttachmentMessage(message: ChatMessage): boolean {
  return message.attachment?.kind === "image" && !!message.attachment.asSticker;
}

type MessageActionsMenuProps = {
  isDark: boolean;
  message: ChatMessage;
  hasText: boolean;
  onReply: () => void;
  onForward: () => void;
  onCopy: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
  /** Figurinha: guardar na lista local. */
  onFavoriteSticker?: () => void;
};

export function MessageActionsMenu({
  isDark,
  message,
  hasText,
  onReply,
  onForward,
  onCopy,
  onDeleteForMe,
  onDeleteForEveryone,
  onFavoriteSticker,
}: MessageActionsMenuProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  if (message.deletedForEveryone) {
    return <div className="h-7 w-7 shrink-0" aria-hidden />;
  }
  const showDelete = message.outgoing;
  const showEveryone = showDelete && canDeleteForEveryone(message);

  const contentClass = `z-[400] min-w-[200px] rounded-xl border p-1 shadow-2xl outline-none ${
    isDark ? "border-zinc-600 bg-zinc-900 text-zinc-100" : "border-zinc-200 bg-white text-zinc-900"
  }`;

  const itemClass = `flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none select-none ${
    isDark ? "hover:bg-zinc-800 focus:bg-zinc-800 data-[highlighted]:bg-zinc-800" : "hover:bg-zinc-100 focus:bg-zinc-100 data-[highlighted]:bg-zinc-100"
  }`;

  const deleteRowClass = `flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm outline-none select-none ${
    isDark
      ? "text-red-400 hover:bg-red-950/40 focus:bg-red-950/40 data-[highlighted]:bg-red-950/40"
      : "text-red-600 hover:bg-red-50 focus:bg-red-50 data-[highlighted]:bg-red-50"
  }`;

  const triggerIdle = isDark
    ? "text-zinc-400 hover:bg-white/10 data-[state=open]:bg-white/10"
    : "text-zinc-500 hover:bg-black/10 data-[state=open]:bg-black/5";

  return (
    <>
      <DropdownMenu.Root modal={false}>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label="Acoes da mensagem"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full opacity-0 transition-opacity duration-150 focus:outline-none focus-visible:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 ${triggerIdle}`}
          >
            <MoreVertical size={16} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            side="bottom"
            align="end"
            sideOffset={4}
            collisionPadding={8}
            className={contentClass}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
            }}
          >
            <DropdownMenu.Item className={itemClass} onSelect={onReply}>
              <Reply size={16} className="shrink-0 opacity-80" />
              Responder
            </DropdownMenu.Item>
            {onFavoriteSticker && isStickerAttachmentMessage(message) && !message.outgoing ? (
              <DropdownMenu.Item className={itemClass} onSelect={onFavoriteSticker}>
                <Star size={16} className="shrink-0 opacity-80" />
                Favoritar figurinha
              </DropdownMenu.Item>
            ) : null}
            <DropdownMenu.Item className={itemClass} onSelect={onForward}>
              <Forward size={16} className="shrink-0 opacity-80" />
              Encaminhar
            </DropdownMenu.Item>
            {hasText ? (
              <DropdownMenu.Item className={itemClass} onSelect={onCopy}>
                <Copy size={16} className="shrink-0 opacity-80" />
                Copiar
              </DropdownMenu.Item>
            ) : null}

            {showDelete ? (
              <DropdownMenu.Item
                className={deleteRowClass}
                onSelect={() => {
                  setDeleteDialogOpen(true);
                }}
              >
                <Trash2 size={16} className="shrink-0 opacity-80" />
                Apagar
              </DropdownMenu.Item>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <DeleteMessageDialog
        open={deleteDialogOpen}
        isDark={isDark}
        showDeleteForEveryone={showEveryone}
        onClose={() => setDeleteDialogOpen(false)}
        onDeleteForMe={onDeleteForMe}
        onDeleteForEveryone={onDeleteForEveryone}
      />
    </>
  );
}
