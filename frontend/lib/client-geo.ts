import { invoke, isTauri } from "@tauri-apps/api/core";

export type ClientGeo = { latitude: number; longitude: number };

type NativeGeo = { latitude: number; longitude: number };

let cached: { geo: ClientGeo; fetchedAt: number } | null = null;
let publicIpCache: { ip: string; fetchedAt: number } | null = null;

/** Duração em que reutilizamos coordenadas sem novo pedido ao browser. */
const CACHE_MS = 15 * 60 * 1000;

/**
 * Última posição obtida (após permissão), válida dentro de CACHE_MS.
 * Útil para enviar lat/lng no login sem novo atraso.
 */
export function getCachedClientGeo(): ClientGeo | null {
  if (!cached) return null;
  if (Date.now() - cached.fetchedAt > CACHE_MS) return null;
  return { ...cached.geo };
}

/**
 * IP público (ex. [api.ipify.org](https://api.ipify.org)) — o servidor em dev costuma ver só ::1;
 * enviamos este valor em `clientPublicIp` para gravar o IP real na sessão.
 */
export function getCachedPublicIp(): string | null {
  if (!publicIpCache) return null;
  if (Date.now() - publicIpCache.fetchedAt > CACHE_MS) return null;
  return publicIpCache.ip;
}

export async function fetchPublicIp(): Promise<string | null> {
  const hit = getCachedPublicIp();
  if (hit) return hit;
  try {
    const res = await fetch("https://api.ipify.org?format=json");
    const j = (await res.json()) as { ip?: string };
    if (typeof j.ip === "string" && j.ip.length >= 3 && j.ip.length <= 45) {
      publicIpCache = { ip: j.ip, fetchedAt: Date.now() };
      return j.ip;
    }
  } catch {
    /* ignorar */
  }
  return null;
}

function setCachedGeo(geo: ClientGeo): ClientGeo {
  cached = { geo, fetchedAt: Date.now() };
  return geo;
}

/**
 * Tauri no macOS: comando nativo `get_native_geo` (Core Location + alerta do sistema).
 * O pacote `tauri-plugin-geolocation` no desktop é stub e não mostra permissão.
 */
async function primeClientGeoTauri(): Promise<ClientGeo | null> {
  try {
    const native = await invoke<NativeGeo | null>("get_native_geo");
    if (
      native != null &&
      typeof native.latitude === "number" &&
      typeof native.longitude === "number" &&
      Number.isFinite(native.latitude) &&
      Number.isFinite(native.longitude)
    ) {
      return setCachedGeo({
        latitude: native.latitude,
        longitude: native.longitude,
      });
    }
  } catch {
    /* ignorar */
  }
  return null;
}

/**
 * Browser / Tauri Windows/Linux: API HTML5 `navigator.geolocation`.
 * No macOS Tauri, prefira `native_macos`; isto só corre se o nativo devolver `null`.
 */
function primeClientGeoWeb(): Promise<ClientGeo | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve(
          setCachedGeo({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
          }),
        );
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 25_000, maximumAge: 0 },
    );
  });
}

/**
 * Pedido de geolocalização. No Tauri macOS usa Core Location nativo (diálogo do sistema).
 * Noutros ambientes, `navigator.geolocation` (no gesto do utilizador).
 * Também dispara o pedido de IP (ipify) em paralelo.
 */
export function primeClientGeo(): Promise<ClientGeo | null> {
  void fetchPublicIp();
  if (!isTauri()) {
    return primeClientGeoWeb();
  }
  return (async () => {
    const fromNative = await primeClientGeoTauri();
    if (fromNative) return fromNative;
    return primeClientGeoWeb();
  })();
}

/**
 * Coordenadas para enviar ao API (cache recente ou novo pedido).
 * Falhas devolvem `null` sem lançar.
 */
export function getClientGeo(): Promise<ClientGeo | null> {
  const hit = getCachedClientGeo();
  if (hit) return Promise.resolve(hit);
  return primeClientGeo();
}
