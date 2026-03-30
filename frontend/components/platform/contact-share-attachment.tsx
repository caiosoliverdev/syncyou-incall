"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, ContactRound, Search, SendHorizonal, X } from "lucide-react";
import type { ShareableContact } from "@/data/shareable-contacts";

function getInitials(name: string) {
  const parts = name.trim().split(" ").filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

function normalizeSearch(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();
}

function matchesContactQuery(contact: ShareableContact, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const hayName = normalizeSearch(contact.name);
  const haySub = contact.subtitle ? normalizeSearch(contact.subtitle) : "";
  return hayName.includes(q) || haySub.includes(q);
}

type ContactShareAttachmentProps = {
  isDark: boolean;
  step: "list" | "preview";
  contacts: ShareableContact[];
  selected: ShareableContact | null;
  onPickContact: (contact: ShareableContact) => void;
  onBackFromPreview: () => void;
  onCancel: () => void;
  onSend: () => void;
};

export function ContactShareAttachment({
  isDark,
  step,
  contacts,
  selected,
  onPickContact,
  onBackFromPreview,
  onCancel,
  onSend,
}: ContactShareAttachmentProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredContacts = useMemo(
    () => contacts.filter((c) => matchesContactQuery(c, searchQuery)),
    [contacts, searchQuery],
  );

  if (step === "preview" && selected) {
    return (
      <div
        className={`flex w-full min-w-0 flex-col gap-2 rounded-2xl border p-2 shadow-lg ${
          isDark ? "border-zinc-600 bg-zinc-900" : "border-zinc-300 bg-white"
        }`}
      >
        <p className={`text-center text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
          Confirmar envio do contato na conversa
        </p>
        <div
          className={`flex items-center gap-3 rounded-xl border p-3 ${
            isDark ? "border-zinc-700 bg-zinc-800/80" : "border-zinc-200 bg-zinc-50"
          }`}
        >
          <div
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              isDark ? "bg-emerald-900/60 text-emerald-200" : "bg-emerald-100 text-emerald-800"
            }`}
          >
            {getInitials(selected.name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className={`truncate font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                {selected.name}
              </p>
              <ContactRound size={14} className={`shrink-0 ${isDark ? "text-zinc-500" : "text-zinc-500"}`} />
            </div>
            {selected.subtitle ? (
              <p
                className={`mt-0.5 break-words text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}
              >
                {selected.subtitle}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            onClick={onBackFromPreview}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
              isDark
                ? "border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                : "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
            }`}
          >
            <ArrowLeft size={14} />
            Voltar
          </button>
          <button
            type="button"
            onClick={onCancel}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
              isDark
                ? "border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
                : "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
            }`}
          >
            <X size={14} />
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSend}
            className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500"
          >
            <SendHorizonal size={14} />
            Enviar contato
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-2 rounded-2xl border p-2 shadow-lg ${
        isDark ? "border-zinc-600 bg-zinc-900" : "border-zinc-300 bg-white"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-0.5">
        <p className={`text-sm font-semibold ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
          Meus contatos
        </p>
        <button
          type="button"
          onClick={onCancel}
          className={`rounded-lg px-2 py-1 text-xs font-medium ${
            isDark ? "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200" : "text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          Fechar
        </button>
      </div>
      <p className={`px-0.5 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
        Apenas contatos individuais. Busque por nome, telefone ou e-mail.
      </p>
      <div className="relative">
        <Search
          size={16}
          className={`pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 ${
            isDark ? "text-zinc-500" : "text-zinc-400"
          }`}
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Pesquisar contato..."
          autoComplete="off"
          className={`w-full rounded-xl border py-2 pr-3 pl-9 text-sm outline-none ${
            isDark
              ? "border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
              : "border-zinc-300 bg-zinc-50 text-zinc-900 placeholder:text-zinc-500"
          }`}
          aria-label="Pesquisar contato"
        />
      </div>
      <ul
        className={`max-h-[min(40vh,320px)] overflow-y-auto rounded-xl border ${
          isDark ? "border-zinc-700 divide-zinc-800" : "border-zinc-200 divide-zinc-200"
        } divide-y`}
        aria-label="Lista de contatos"
      >
        {filteredContacts.length === 0 ? (
          <li
            className={`px-3 py-8 text-center text-sm ${
              isDark ? "text-zinc-500" : "text-zinc-500"
            }`}
          >
            Nenhum contato encontrado.
            {searchQuery.trim() ? " Tente outro termo." : ""}
          </li>
        ) : (
          filteredContacts.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPickContact(c)}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left transition ${
                  isDark ? "hover:bg-zinc-800" : "hover:bg-zinc-50"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    isDark ? "bg-zinc-700 text-zinc-100" : "bg-zinc-200 text-zinc-800"
                  }`}
                >
                  {getInitials(c.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <span className={`block truncate text-sm font-medium ${isDark ? "text-zinc-100" : "text-zinc-900"}`}>
                    {c.name}
                  </span>
                  {c.subtitle ? (
                    <span className={`line-clamp-2 text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
                      {c.subtitle}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
