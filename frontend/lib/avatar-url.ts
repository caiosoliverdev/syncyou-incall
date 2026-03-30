/**
 * O URL público do avatar pode ser o mesmo após substituir o ficheiro no servidor;
 * browsers e WebViews cacheiam por URL. Use após upload ou quando precisar de forçar reload.
 */
export function bustAvatarCache(url: string | null): string | null {
  if (!url?.trim()) return null;
  const base = url.trim().replace(/[?#].*$/, "");
  return `${base}?t=${Date.now()}`;
}
