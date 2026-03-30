"use client";

import type { ReactNode } from "react";
import { SETTINGS_SECTIONS } from "./settings-types";
import type { SettingsSectionId } from "./settings-types";

type SettingsMainPanelProps = {
  isDark: boolean;
  section: SettingsSectionId;
  /** Conteúdo da aba Conta (formulário de perfil). */
  accountPanel?: ReactNode;
  /** Conteúdo da aba Segurança. */
  securityPanel?: ReactNode;
  /** Conteúdo da aba Sessões. */
  sessionsPanel?: ReactNode;
};

export function SettingsMainPanel({
  isDark,
  section,
  accountPanel,
  securityPanel,
  sessionsPanel,
}: SettingsMainPanelProps) {
  const meta = SETTINGS_SECTIONS.find((s) => s.id === section);

  return (
    <div
      className={`flex h-full min-h-0 flex-1 flex-col overflow-y-auto ${
        isDark ? "bg-zinc-950" : "bg-zinc-50"
      }`}
    >
      <div
        className={`shrink-0 border-b px-6 py-5 sm:px-8 sm:py-6 ${
          isDark ? "border-zinc-800 bg-zinc-950/80" : "border-emerald-100 bg-white/60"
        }`}
      >
        <h2
          className={`text-lg font-semibold tracking-tight ${
            isDark ? "text-zinc-100" : "text-emerald-950"
          }`}
        >
          {meta?.label ?? "Definições"}
        </h2>
        <p className={`mt-1 text-sm ${isDark ? "text-zinc-400" : "text-emerald-900/65"}`}>
          {meta?.description}
        </p>
      </div>

      {section === "account" && accountPanel ? (
        <div className="min-h-0 w-full min-w-0 flex-1">{accountPanel}</div>
      ) : section === "security" && securityPanel ? (
        <div className="min-h-0 w-full min-w-0 flex-1">{securityPanel}</div>
      ) : section === "sessions" && sessionsPanel ? (
        <div className="min-h-0 w-full min-w-0 flex-1">{sessionsPanel}</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-8 py-16">
          <div
            className={`max-w-md rounded-2xl border px-8 py-10 text-center shadow-sm ${
              isDark
                ? "border-zinc-800 bg-zinc-900/50 text-zinc-300"
                : "border-emerald-100 bg-white text-emerald-900/75"
            }`}
          >
            <p className="text-sm leading-relaxed">
              Esta secção será configurada em breve. Aqui poderá gerir{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {meta?.label.toLowerCase()}
              </span>{" "}
              com mais detalhe.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
