/**
 * `localScreenStream` / `remoteScreenStream` já chegam aqui semanticamente classificados
 * pela camada de captura/sessão. No receiver remoto, os metadados do track podem não
 * indicar `displaySurface`, então não devemos reclassificar de novo.
 */
export function hasLiveRemoteOrLocalScreenCapture(
  stream: MediaStream | null | undefined,
): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some((t) => t.readyState === "live");
}
