"use client";

import { useRef, type ChangeEvent } from "react";
import {
  LoaderCircle,
  LogOut,
  MonitorSmartphone,
  Pencil,
  Plug,
  Shield,
  Sparkles,
  UserRound,
} from "lucide-react";
import type { AuthUser } from "@/lib/api";
import type { SettingsSectionId } from "./settings-types";
import { SETTINGS_SECTIONS } from "./settings-types";

const SECTION_ICONS: Record<SettingsSectionId, typeof UserRound> = {
  account: UserRound,
  security: Shield,
  sessions: MonitorSmartphone,
  fourT: Sparkles,
  integrations: Plug,
};

type SettingsSidebarContentProps = {
  isDark: boolean;
  user: AuthUser | null;
  userLoading: boolean;
  section: SettingsSectionId;
  onSectionChange: (id: SettingsSectionId) => void;
  onLogout: () => void;
  onAvatarFileChosen: (file: File) => void;
  avatarUploading: boolean;
};

function initials(u: AuthUser): string {
  const a = u.firstName?.trim()?.[0] ?? "";
  const b = u.lastName?.trim()?.[0] ?? "";
  const s = `${a}${b}`.toUpperCase();
  if (s) return s.slice(0, 2);
  return (u.email?.[0] ?? "?").toUpperCase();
}

export function SettingsSidebarContent({
  isDark,
  user,
  userLoading,
  section,
  onSectionChange,
  onLogout,
  onAvatarFileChosen,
  avatarUploading,
}: SettingsSidebarContentProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const dividerClass = isDark ? "bg-zinc-700/80" : "bg-emerald-200/80";

  const onFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onAvatarFileChosen(file);
    }
    event.currentTarget.value = "";
  };

  return (
    <div
      className={`flex h-full min-h-0 flex-col ${
        isDark ? "bg-zinc-900" : "bg-white"
      }`}
    >
      <div className="shrink-0 border-b px-4 py-4">
        {userLoading ? (
          <div className="flex animate-pulse items-center gap-3">
            <div
              className={`h-[72px] w-[72px] shrink-0 rounded-full ${isDark ? "bg-zinc-700" : "bg-emerald-100"}`}
            />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`h-3.5 w-28 rounded ${isDark ? "bg-zinc-700" : "bg-emerald-100"}`} />
              <div className={`h-3 w-36 rounded ${isDark ? "bg-zinc-700" : "bg-emerald-100"}`} />
            </div>
          </div>
        ) : user ? (
          <div className="flex gap-3">
            <div className="relative shrink-0">
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                tabIndex={-1}
                onChange={onFileInput}
              />
              <button
                type="button"
                disabled={avatarUploading}
                onClick={() => fileRef.current?.click()}
                className={`group relative flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-full ring-2 ring-offset-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isDark
                    ? "ring-emerald-500/35 ring-offset-zinc-900"
                    : "ring-emerald-500/40 ring-offset-white"
                } ${avatarUploading ? "cursor-wait opacity-80" : "cursor-pointer"}`}
                aria-label="Alterar foto de perfil"
              >
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL dinâmica da API
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-700 text-xl font-semibold text-white`}
                  >
                    {initials(user)}
                  </div>
                )}
                <span
                  className={`pointer-events-none absolute inset-0 flex items-center justify-center rounded-full transition ${
                    avatarUploading
                      ? "bg-black/45"
                      : "bg-black/0 group-hover:bg-black/25 group-focus-visible:bg-black/25"
                  }`}
                >
                  {avatarUploading ? (
                    <LoaderCircle className="h-6 w-6 animate-spin text-white/90" strokeWidth={2} />
                  ) : (
                    <Pencil
                      className="h-3.5 w-3.5 text-white/35 drop-shadow-sm transition group-hover:text-white/75 group-focus-visible:text-white/75"
                      strokeWidth={2}
                      aria-hidden
                    />
                  )}
                </span>
              </button>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p
                    className={`truncate text-[15px] font-semibold leading-tight tracking-tight ${
                      isDark ? "text-zinc-100" : "text-emerald-950"
                    }`}
                  >
                    {user.firstName} {user.lastName}
                  </p>
                  <p
                    className={`mt-0.5 truncate text-xs leading-snug ${
                      isDark ? "text-zinc-400" : "text-emerald-800/75"
                    }`}
                    title={user.email}
                  >
                    {user.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onLogout}
                  className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                    isDark
                      ? "border-red-900/55 bg-red-950/35 text-red-200 hover:bg-red-950/60"
                      : "border-red-200/90 bg-red-50 text-red-800 hover:bg-red-100"
                  }`}
                >
                  <LogOut size={14} strokeWidth={2.25} />
                  Sair
                </button>
              </div>
              <p
                className={`mt-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
                  user.emailVerified
                    ? isDark
                      ? "bg-emerald-950/80 text-emerald-400"
                      : "bg-emerald-100 text-emerald-800"
                    : isDark
                      ? "bg-amber-950/60 text-amber-300"
                      : "bg-amber-100 text-amber-900"
                }`}
              >
                {user.emailVerified ? "Email verificado" : "Email pendente"}
              </p>
            </div>
          </div>
        ) : (
          <p className={`text-sm ${isDark ? "text-zinc-400" : "text-emerald-800/80"}`}>
            Não foi possível carregar o perfil.
          </p>
        )}
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-2 py-3">
        <p
          className={`mb-2 px-2 text-[10px] font-semibold uppercase tracking-[0.2em] ${
            isDark ? "text-zinc-500" : "text-emerald-700/70"
          }`}
        >
          Definições
        </p>
        <ul className="space-y-0">
          {SETTINGS_SECTIONS.map((item, index) => {
            const Icon = SECTION_ICONS[item.id];
            const active = section === item.id;
            return (
              <li key={item.id}>
                {index > 0 ? <div className={`my-2 h-px ${dividerClass}`} /> : null}
                <button
                  type="button"
                  onClick={() => onSectionChange(item.id)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition ${
                    active
                      ? isDark
                        ? "bg-emerald-950/50 text-emerald-100 shadow-sm ring-1 ring-emerald-700/50"
                        : "bg-emerald-50 text-emerald-950 shadow-sm ring-1 ring-emerald-200/80"
                      : isDark
                        ? "text-zinc-300 hover:bg-zinc-800/90"
                        : "text-emerald-950/90 hover:bg-emerald-50/80"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${
                      active
                        ? "bg-emerald-600/90 text-white"
                        : isDark
                          ? "bg-zinc-800 text-zinc-400"
                          : "bg-emerald-100/90 text-emerald-800"
                    }`}
                  >
                    <Icon size={16} strokeWidth={2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.label}</span>
                    <span
                      className={`mt-0.5 block text-[11px] leading-snug ${
                        active
                          ? isDark
                            ? "text-emerald-300/90"
                            : "text-emerald-800/75"
                          : isDark
                            ? "text-zinc-500"
                            : "text-emerald-800/55"
                      }`}
                    >
                      {item.description}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
