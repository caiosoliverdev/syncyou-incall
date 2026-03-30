const FAV = "incall_sticker_favorites_v1";
const CREATED = "incall_sticker_created_v1";

function readSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
  } catch {
    return new Set();
  }
}

function writeSet(key: string, urls: Set<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify([...urls]));
}

export function listStickerFavorites(): string[] {
  return [...readSet(FAV)];
}

export function addStickerFavorite(url: string) {
  const s = readSet(FAV);
  s.add(url);
  writeSet(FAV, s);
}

export function removeStickerFavorite(url: string) {
  const s = readSet(FAV);
  s.delete(url);
  writeSet(FAV, s);
}

export function listStickerCreated(): string[] {
  return [...readSet(CREATED)];
}

export function addStickerCreated(url: string) {
  const s = readSet(CREATED);
  s.add(url);
  writeSet(CREATED, s);
}

/** Mesma figurinha com query/hash diferente conta como uma só. */
function canonicalStickerUrl(u: string): string {
  try {
    const x = new URL(u);
    return `${x.origin}${x.pathname}`;
  } catch {
    return u.trim();
  }
}

/** Criadas primeiro; favoritos a seguir, sem repetir URL canónica. */
export function mergeStickerLibrary(): string[] {
  const created = listStickerCreated();
  const favs = listStickerFavorites();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const url of created) {
    const k = canonicalStickerUrl(url);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(url);
  }
  for (const url of favs) {
    const k = canonicalStickerUrl(url);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(url);
  }
  return out;
}
