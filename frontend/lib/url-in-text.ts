/** Alinhado a `URL_SPLIT` em `message-text.tsx`. */
const URL_SPLIT = /(https?:\/\/[^\s]+|www\.[^\s]+)/gi;

export function firstHttpUrlInText(text: string): string | null {
  const parts = text.split(URL_SPLIT);
  for (const part of parts) {
    if (!part) continue;
    if (/^https?:\/\//i.test(part)) return part;
    if (/^www\./i.test(part)) return `https://${part}`;
  }
  return null;
}
