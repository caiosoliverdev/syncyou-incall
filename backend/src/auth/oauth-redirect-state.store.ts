import { randomBytes } from 'crypto';

type Entry = { fr: string; exp: number; bridgeId?: string; clientPublicIp?: string };

/** Estado opaco OAuth → redirect final (browser externo / deep link). Processo single-node. */
const store = new Map<string, Entry>();

const TTL_MS = 10 * 60 * 1000;

function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (v.exp < now) store.delete(k);
  }
}

export function saveOAuthRedirectState(
  redirectUri: string,
  bridgeId?: string,
  clientPublicIp?: string,
): string {
  prune();
  const id = randomBytes(16).toString('hex');
  const bid = bridgeId?.trim();
  const pip = clientPublicIp?.trim();
  store.set(id, {
    fr: redirectUri.trim().replace(/\/$/, ''),
    exp: Date.now() + TTL_MS,
    ...(bid ? { bridgeId: bid } : {}),
    ...(pip && pip.length <= 45 ? { clientPublicIp: pip } : {}),
  });
  return id;
}

export function consumeOAuthRedirectState(
  stateId: string | undefined,
): { redirectUri: string; bridgeId?: string; clientPublicIp?: string } | undefined {
  if (!stateId?.trim()) return undefined;
  prune();
  const row = store.get(stateId);
  store.delete(stateId);
  if (!row || row.exp < Date.now()) return undefined;
  return {
    redirectUri: row.fr,
    bridgeId: row.bridgeId,
    ...(row.clientPublicIp ? { clientPublicIp: row.clientPublicIp } : {}),
  };
}
