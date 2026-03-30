"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Maximize2, Minus, Moon, Sun, X } from "lucide-react";

type WindowTitleBarProps = {
  isDark: boolean;
  onToggleTheme: () => void;
  /** Conteúdo à esquerda do botão de tema (ex.: notificações). */
  beforeThemeToggle?: ReactNode;
  /** Texto principal à direita do logo (ex.: Login, Mensagens). Ignorado se `symbolOnly`. */
  title: string;
  /** Linha opcional abaixo do título (ex.: subtítulo) */
  subtitle?: string;
  showThemeToggle?: boolean;
  /** Apenas o símbolo à esquerda (ex.: ecrã de login sem "SyncYou" nem título). */
  symbolOnly?: boolean;
  /** Esconde o símbolo à esquerda (ex.: login só com área de arrastar). */
  hideSymbol?: boolean;
  /** Mostra o botão maximizar (ex.: `false` no login). */
  showMaximize?: boolean;
};

export function WindowTitleBar({
  isDark,
  onToggleTheme,
  beforeThemeToggle,
  title,
  subtitle,
  showThemeToggle = true,
  symbolOnly = false,
  hideSymbol = false,
  showMaximize = true,
}: WindowTitleBarProps) {
  const [maximized, setMaximized] = useState(false);

  const refreshMaximized = useCallback(async () => {
    if (!isTauri()) return;
    try {
      setMaximized(await getCurrentWindow().isMaximized());
    } catch {
      /* ignorar */
    }
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    void refreshMaximized();
    let unlisten: (() => void) | undefined;
    void (async () => {
      try {
        unlisten = await getCurrentWindow().onResized(() => {
          void refreshMaximized();
        });
      } catch {
        /* ignorar */
      }
    })();
    return () => {
      unlisten?.();
    };
  }, [refreshMaximized]);

  const minimize = () => {
    if (!isTauri()) return;
    void getCurrentWindow().minimize();
  };

  const toggleMaximize = () => {
    if (!isTauri()) return;
    void getCurrentWindow().toggleMaximize();
    void refreshMaximized();
  };

  const closeWindow = () => {
    if (!isTauri()) return;
    void getCurrentWindow().close();
  };

  const tauri = isTauri();

  return (
    <header
      className={`flex h-11 shrink-0 items-stretch border-b select-none ${
        isDark ? "border-zinc-800 bg-zinc-900" : "border-emerald-200/70 bg-white"
      }`}
    >
      <div
        className="flex min-w-0 flex-1 items-center gap-2 px-3"
        data-tauri-drag-region
      >
        {!hideSymbol ? (
          <span className="flex h-7 w-7 shrink-0 overflow-hidden rounded-md bg-white ring-1 ring-black/5 dark:ring-white/10">
            {/* eslint-disable-next-line @next/next/no-img-element -- small static asset in title bar */}
            <img
              src={isDark ? "/simbulo-ligth.svg" : "/simbulo-dark.svg"}
              alt=""
              width={28}
              height={28}
              className="h-full w-full object-cover"
              draggable={false}
            />
          </span>
        ) : null}
        {!symbolOnly ? (
          <div className="min-w-0">
            <p
              className={`truncate text-[10px] font-medium uppercase tracking-[0.2em] ${
                isDark ? "text-emerald-400/90" : "text-emerald-700/85"
              }`}
            >
              SyncYou
            </p>
            <p
              className={`truncate text-sm font-semibold leading-tight ${
                isDark ? "text-zinc-100" : "text-emerald-950"
              }`}
            >
              {title}
            </p>
            {subtitle ? (
              <p
                className={`truncate text-[11px] ${isDark ? "text-zinc-500" : "text-emerald-800/70"}`}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5 pr-1">
        {beforeThemeToggle}
        {showThemeToggle ? (
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
            className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
              isDark
                ? "text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
                : "text-emerald-800 hover:bg-emerald-100"
            }`}
          >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        ) : null}

        {tauri ? (
          <>
            <button
              type="button"
              onClick={minimize}
              aria-label="Minimizar"
              className={`flex h-8 w-9 items-center justify-center rounded-md transition-colors ${
                isDark
                  ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                  : "text-zinc-600 hover:bg-emerald-100"
              }`}
            >
              <Minus size={15} strokeWidth={2.25} />
            </button>
            {showMaximize ? (
              <button
                type="button"
                onClick={toggleMaximize}
                aria-label={maximized ? "Restaurar" : "Maximizar"}
                className={`flex h-8 w-9 items-center justify-center rounded-md transition-colors ${
                  isDark
                    ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                    : "text-zinc-600 hover:bg-emerald-100"
                }`}
              >
                {maximized ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <rect x="4" y="8" width="12" height="12" stroke="currentColor" strokeWidth="2" />
                    <path d="M8 8V6a2 2 0 012-2h10a2 2 0 012 2v10a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="2" />
                  </svg>
                ) : (
                  <Maximize2 size={14} strokeWidth={2.25} />
                )}
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeWindow}
              aria-label="Fechar"
              className={`flex h-8 w-9 items-center justify-center rounded-md transition-colors ${
                isDark
                  ? "text-zinc-400 hover:bg-red-900/70 hover:text-red-100"
                  : "text-zinc-600 hover:bg-red-100 hover:text-red-800"
              }`}
            >
              <X size={15} strokeWidth={2.25} />
            </button>
          </>
        ) : null}
      </div>
    </header>
  );
}
