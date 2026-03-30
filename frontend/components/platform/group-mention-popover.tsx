"use client";

import Image from "next/image";

import { UsersRound } from "lucide-react";
import { formatGroupRoleLabel } from "@/lib/group-role";
import type { GroupMentionMember } from "./group-mention-types";

type GroupMentionPopoverProps = {
  isDark: boolean;
  members: GroupMentionMember[];
  highlightedIndex: number;
  onHighlightIndexChange: (index: number) => void;
  onPick: (member: GroupMentionMember) => void;
};

function getInitials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function GroupMentionPopover({
  isDark,
  members,
  highlightedIndex,
  onHighlightIndexChange,
  onPick,
}: GroupMentionPopoverProps) {
  if (members.length === 0) {
    return (
      <div
        className={`pointer-events-auto z-[230] max-h-48 overflow-hidden rounded-xl border px-3 py-3 text-center text-sm shadow-xl ${
          isDark ? "border-zinc-600 bg-zinc-900 text-zinc-400" : "border-zinc-200 bg-white text-zinc-600"
        }`}
        role="listbox"
        aria-label="Menções do grupo"
      >
        Nenhum integrante encontrado.
      </div>
    );
  }

  return (
    <div
      className={`pointer-events-auto z-[230] max-h-48 min-w-[220px] max-w-sm overflow-hidden rounded-xl border shadow-xl ${
        isDark ? "border-zinc-600 bg-zinc-900" : "border-zinc-200 bg-white"
      }`}
      role="listbox"
      aria-label="Menções do grupo"
    >
      <p
        className={`border-b px-2 py-1.5 text-[11px] font-medium ${
          isDark ? "border-zinc-700 text-zinc-500" : "border-zinc-200 text-zinc-500"
        }`}
      >
        Mencionar integrante
      </p>
      <ul className={`max-h-40 overflow-y-auto py-1 ${isDark ? "divide-zinc-800" : "divide-zinc-100"}`}>
        {members.map((member, index) => {
          const active = index === highlightedIndex;
          return (
            <li key={member.kind === "group_all" ? `${member.id}-all` : member.id} role="none">
              <button
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => onHighlightIndexChange(index)}
                onClick={() => onPick(member)}
                className={`flex w-full items-center gap-2 px-2.5 py-2 text-left text-sm outline-none ${
                  active
                    ? isDark
                      ? "bg-emerald-900/35 text-emerald-100"
                      : "bg-emerald-50 text-emerald-900"
                    : isDark
                      ? "text-zinc-200 hover:bg-zinc-800"
                      : "text-zinc-900 hover:bg-zinc-50"
                }`}
              >
                {member.kind === "group_all" ? (
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      isDark ? "bg-emerald-900/40 text-emerald-200" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    <UsersRound size={16} aria-hidden />
                  </span>
                ) : member.avatarUrl ? (
                  <span className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10">
                    <Image
                      src={member.avatarUrl}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="32px"
                    />
                  </span>
                ) : (
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                      isDark ? "bg-zinc-700 text-zinc-100" : "bg-zinc-200 text-zinc-800"
                    }`}
                  >
                    {getInitials(member.name)}
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{member.name}</span>
                  <span className={`block truncate text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                    {formatGroupRoleLabel(member.role)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
