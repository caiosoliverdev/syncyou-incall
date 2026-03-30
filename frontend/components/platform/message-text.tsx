"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";

/** Acima disto, mostra truncado com «Ler mais». */
const LONG_TEXT_THRESHOLD = 420;
import { LinkChoiceDialog } from "@/components/ui/link-choice-dialog";
import { MentionContactMenu } from "@/components/platform/mention-contact-menu";
import { GROUP_ALL_MENTION_USER_ID, splitTextWithMentions } from "@/lib/group-mention";

const URL_SPLIT = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

function normalizeHref(part: string): string {
  if (part.startsWith("http://") || part.startsWith("https://")) return part;
  if (part.startsWith("www.")) return `https://${part}`;
  return part;
}

export type GroupMentionHandlers = {
  currentUserId: string | null;
  isPeerFriend: (userId: string) => boolean;
  /** Pedido de amizade já enviado (pendente). */
  hasOutgoingFriendRequest?: (userId: string) => boolean;
  onAddFriend: (userId: string) => void;
  onChat: (userId: string, displayName: string) => void;
  onViewContact: (userId: string) => void;
};

function mentionChipClass(outgoing: boolean, failed: boolean, isDark: boolean): string {
  const base = "cursor-pointer rounded-sm font-medium underline decoration-sky-500/80 underline-offset-2 transition hover:decoration-sky-400";
  if (failed) {
    return isDark ? `${base} text-sky-200` : `${base} text-sky-900`;
  }
  if (outgoing) {
    return isDark ? `${base} text-sky-200` : `${base} text-blue-800`;
  }
  return isDark ? `${base} text-sky-400` : `${base} text-blue-600`;
}

function renderUrlParts(
  fragment: string,
  linkClassName: string,
  keyPrefix: string,
  onLinkClick: (e: MouseEvent<HTMLAnchorElement>, href: string) => void,
): ReactNode[] {
  const parts = fragment.split(URL_SPLIT);
  return parts.map((part, i) => {
    if (!part) return null;
    if (/^https?:\/\//i.test(part) || /^www\./i.test(part)) {
      const href = normalizeHref(part);
      return (
        <a
          key={`${keyPrefix}-u-${i}`}
          href={href}
          onClick={(e) => onLinkClick(e, href)}
          className={`cursor-pointer font-medium underline underline-offset-2 ${linkClassName}`}
        >
          {part}
        </a>
      );
    }
    return <span key={`${keyPrefix}-t-${i}`}>{part}</span>;
  });
}

/** Preserva quebras de linha e destaca URLs no meio do texto; em grupos, menções @[id](nome) como link azul com menu. */
export function MessageText({
  text,
  linkClassName,
  isDark = false,
  groupMentions,
  outgoingBubble = false,
  bubbleFailed = false,
}: {
  text: string;
  linkClassName: string;
  isDark?: boolean;
  groupMentions?: GroupMentionHandlers | null;
  outgoingBubble?: boolean;
  bubbleFailed?: boolean;
}): ReactNode {
  const [expanded, setExpanded] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [mentionMenu, setMentionMenu] = useState<{
    userId: string;
    label: string;
    anchorRect: DOMRect;
  } | null>(null);

  const close = useCallback(() => setPendingHref(null), []);

  useEffect(() => {
    if (!pendingHref) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pendingHref, close]);

  const handleLinkClick = useCallback((e: MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    setPendingHref(href);
  }, []);

  const copyLink = useCallback(async () => {
    if (!pendingHref) return;
    try {
      await navigator.clipboard.writeText(pendingHref);
    } catch {
      /* ignore */
    }
    close();
  }, [pendingHref, close]);

  const openBrowser = useCallback(async () => {
    if (!pendingHref) return;
    const url = pendingHref;
    close();
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [pendingHref, close]);

  const segments = useMemo(() => {
    if (!groupMentions) return [{ type: "text" as const, value: text }];
    return splitTextWithMentions(text);
  }, [text, groupMentions]);

  const chipClass = mentionChipClass(outgoingBubble, bubbleFailed, isDark);

  const isLong = text.length > LONG_TEXT_THRESHOLD;
  const clampClass = isLong && !expanded ? "line-clamp-[8]" : "";

  const body = (
    <span className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
      {segments.map((seg, si) => {
        if (seg.type === "text") {
          return <span key={`seg-${si}`}>{renderUrlParts(seg.value, linkClassName, `s${si}`, handleLinkClick)}</span>;
        }

        const display = `@${seg.label}`;
        if (!groupMentions) {
          return <span key={`seg-${si}`}>{display}</span>;
        }

        if (seg.userId === GROUP_ALL_MENTION_USER_ID) {
          return (
            <span key={`seg-${si}`} className={`${chipClass} cursor-default`}>
              {display}
            </span>
          );
        }

        const isSelf = groupMentions.currentUserId != null && seg.userId === groupMentions.currentUserId;

        return (
          <button
            key={`seg-${si}`}
            type="button"
            tabIndex={isSelf ? -1 : 0}
            disabled={isSelf}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (isSelf) return;
              setMentionMenu({
                userId: seg.userId,
                label: seg.label,
                anchorRect: e.currentTarget.getBoundingClientRect(),
              });
            }}
            className={
              isSelf
                ? `${chipClass} cursor-default underline decoration-sky-500/40 opacity-90`
                : chipClass
            }
          >
            {display}
          </button>
        );
      })}
    </span>
  );

  return (
    <>
      <div className={`min-w-0 ${clampClass}`}>{body}</div>
      {isLong ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className={`mt-1.5 text-xs font-semibold underline-offset-2 transition hover:underline ${
            isDark ? "text-zinc-400 hover:text-zinc-300" : "text-zinc-600 hover:text-zinc-800"
          }`}
        >
          {expanded ? "Mostrar menos" : "Ler mais"}
        </button>
      ) : null}
      <LinkChoiceDialog
        open={pendingHref !== null}
        url={pendingHref ?? ""}
        isDark={isDark}
        onCopy={copyLink}
        onOpenBrowser={openBrowser}
        onCancel={close}
      />
      {groupMentions && mentionMenu ? (
        <MentionContactMenu
          open
          anchorRect={mentionMenu.anchorRect}
          isDark={isDark}
          isFriend={groupMentions.isPeerFriend(mentionMenu.userId)}
          friendRequestPending={
            groupMentions.hasOutgoingFriendRequest?.(mentionMenu.userId) ?? false
          }
          onClose={() => setMentionMenu(null)}
          onAddFriend={() => groupMentions.onAddFriend(mentionMenu.userId)}
          onChat={() => groupMentions.onChat(mentionMenu.userId, mentionMenu.label)}
          onViewContact={() => groupMentions.onViewContact(mentionMenu.userId)}
        />
      ) : null}
    </>
  );
}
