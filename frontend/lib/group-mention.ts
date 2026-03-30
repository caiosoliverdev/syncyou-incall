/** Menção “@todos” / @all no grupo — notifica todos os participantes. */
export const GROUP_ALL_MENTION_USER_ID = "__incall_group_all__";

const GROUP_ALL_TAIL = `(?=\\s|$|[.,!?;:\\n]|\\r|,)`;

/** Menção em grupo: @[userId](nome) — parênteses no nome são guardados como fullwidth para o fecho `)` não quebrar o token. */
export function encodeGroupMention(userId: string, displayName: string): string {
  const safe = displayName.replace(/\(/g, "（").replace(/\)/g, "）");
  return `@[${userId}](${safe})`;
}

export function decodeMentionLabel(stored: string): string {
  return stored.replace(/（/g, "(").replace(/）/g, ")");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Texto do compositor: troca @[id](nome) por @nome visível. */
export function prettifyCanonicalMentionsInDraft(text: string): string {
  return text.replace(/@\[([^\]]+)\]\(([^)]*)\)/g, (_, _id, labelRaw) => {
    return `@${decodeMentionLabel(labelRaw)}`;
  });
}

/**
 * Mesmo que `prettifyCanonicalMentionsInDraft`, mantendo o cursor estável ao
 * substituir tokens longos por @Nome.
 */
export function prettifyCanonicalMentionsInDraftAtCursor(
  text: string,
  cursor: number,
): { text: string; cursor: number } {
  const pretty = prettifyCanonicalMentionsInDraft(text);
  if (pretty === text) return { text, cursor };

  let newCursor = cursor;
  const re = /@\[([^\]]+)\]\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const full = m[0];
    const label = decodeMentionLabel(m[2]);
    const repl = `@${label}`;
    const start = m.index;
    const end = start + full.length;
    if (cursor <= start) continue;
    if (cursor >= end) {
      newCursor -= full.length - repl.length;
    } else {
      const prettyBefore = prettifyCanonicalMentionsInDraft(text.slice(0, start));
      newCursor = prettyBefore.length + repl.length;
      break;
    }
  }
  return { text: pretty, cursor: Math.max(0, Math.min(newCursor, pretty.length)) };
}

/** Converte @Nome no rascunho para @[id](nome) antes de enviar à API. */
export function serializeGroupMentionsForApi(
  text: string,
  members: ReadonlyArray<{ id: string; name: string }>,
): string {
  const sorted = [...members].filter((m) => m.name.trim().length > 0).sort((a, b) => b.name.length - a.name.length);
  let out = text;
  out = out.replace(
    new RegExp(`@all${GROUP_ALL_TAIL}`, "gi"),
    encodeGroupMention(GROUP_ALL_MENTION_USER_ID, "todos"),
  );
  out = out.replace(
    new RegExp(`@todos${GROUP_ALL_TAIL}`, "gi"),
    encodeGroupMention(GROUP_ALL_MENTION_USER_ID, "todos"),
  );
  for (const m of sorted) {
    const esc = escapeRegExp(m.name);
    const re = new RegExp(`@${esc}(?=\\s|$|[.,!?;:\\n]|\\r|,)`, "g");
    out = out.replace(re, encodeGroupMention(m.id, m.name));
  }
  return out;
}

export type TextSegment =
  | { type: "text"; value: string }
  | { type: "mention"; userId: string; label: string };

const MENTION_RE = /@\[([^\]]+)\]\(([^)]*)\)/g;

export function splitTextWithMentions(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  const re = new RegExp(MENTION_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      segments.push({ type: "text", value: text.slice(last, m.index) });
    }
    segments.push({
      type: "mention",
      userId: m[1],
      label: decodeMentionLabel(m[2]),
    });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    segments.push({ type: "text", value: text.slice(last) });
  }
  return segments;
}
