"use client";

import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef } from "react";
import { MessageCircle, UserPlus, User } from "lucide-react";

const MENU_W = 220;
const MENU_H = 96;

function computePosition(rect: DOMRect) {
  let top = rect.bottom + 6;
  let left = rect.left;
  if (top + MENU_H > window.innerHeight - 8) {
    top = Math.max(8, rect.top - MENU_H - 6);
  }
  if (left + MENU_W > window.innerWidth - 8) {
    left = window.innerWidth - MENU_W - 8;
  }
  return { top, left };
}

type MentionContactMenuProps = {
  open: boolean;
  anchorRect: DOMRect | null;
  isDark: boolean;
  isFriend: boolean;
  /** Já existe pedido de amizade pendente (enviado por mim). */
  friendRequestPending?: boolean;
  onClose: () => void;
  onAddFriend: () => void;
  onChat: () => void;
  onViewContact: () => void;
};

export function MentionContactMenu({
  open,
  anchorRect,
  isDark,
  isFriend,
  friendRequestPending = false,
  onClose,
  onAddFriend,
  onChat,
  onViewContact,
}: MentionContactMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const pos = useMemo(() => (anchorRect ? computePosition(anchorRect) : null), [anchorRect]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  if (!open || !anchorRect || !pos) return null;

  const itemClass = `flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-sm font-medium transition ${
    isDark ? "text-zinc-100 hover:bg-zinc-800" : "text-zinc-900 hover:bg-zinc-100"
  }`;

  return createPortal(
    <div
      ref={menuRef}
      data-mention-contact-menu
      role="menu"
      className={`fixed z-[220] min-w-[220px] overflow-hidden rounded-xl border shadow-xl ${
        isDark ? "border-zinc-600 bg-zinc-900" : "border-zinc-200 bg-white"
      }`}
      style={{ top: pos.top, left: pos.left }}
    >
      {isFriend ? (
        <>
          <button type="button" role="menuitem" className={itemClass} onClick={() => { onChat(); onClose(); }}>
            <MessageCircle size={16} className="shrink-0 opacity-80" aria-hidden />
            Conversar
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => { onViewContact(); onClose(); }}>
            <User size={16} className="shrink-0 opacity-80" aria-hidden />
            Ver contato
          </button>
        </>
      ) : friendRequestPending ? (
        <>
          <div
            className={`px-3 py-2.5 text-sm font-medium ${
              isDark ? "text-zinc-400" : "text-zinc-600"
            }`}
            role="status"
          >
            Pedido de amizade enviado
          </div>
          <button type="button" role="menuitem" className={itemClass} onClick={() => { onViewContact(); onClose(); }}>
            <User size={16} className="shrink-0 opacity-80" aria-hidden />
            Ver contato
          </button>
        </>
      ) : (
        <>
          <button type="button" role="menuitem" className={itemClass} onClick={() => { onAddFriend(); onClose(); }}>
            <UserPlus size={16} className="shrink-0 opacity-80" aria-hidden />
            Adicionar como amigo
          </button>
          <button type="button" role="menuitem" className={itemClass} onClick={() => { onViewContact(); onClose(); }}>
            <User size={16} className="shrink-0 opacity-80" aria-hidden />
            Ver contato
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
