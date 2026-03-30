import type { ChatReplyRef } from "@/data/mock-conversation-messages";

const STORAGE_KEY = "incall-chat-offbox-v1";

export type OutboxEntry = {
  tempId: string;
  conversationId: string;
  text: string;
  replyTo?: ChatReplyRef;
};
type Stored = { outbox: OutboxEntry[] };

function readJson(): Stored {
  if (typeof window === "undefined") return { outbox: [] };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { outbox: [] };
    const p = JSON.parse(raw) as Stored;
    if (!Array.isArray(p.outbox)) return { outbox: [] };
    return p;
  } catch {
    return { outbox: [] };
  }
}

function writeJson(s: Stored): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota / privado */
  }
}

export function outboxRead(): OutboxEntry[] {
  return readJson().outbox;
}

export function outboxAdd(entry: OutboxEntry): void {
  const { outbox } = readJson();
  writeJson({ outbox: [...outbox.filter((e) => e.tempId !== entry.tempId), entry] });
}

export function outboxRemove(tempId: string): void {
  const { outbox } = readJson();
  writeJson({ outbox: outbox.filter((e) => e.tempId !== tempId) });
}
