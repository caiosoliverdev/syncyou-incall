/**
 * WebKit/WKWebView (Tauri no macOS): `HTMLAudioElement` + `srcObject` com MediaStream
 * WebRTC muitas vezes não emite som. Web Audio API → `destination` costuma funcionar.
 */
export function playRemoteMediaStreamWebAudio(stream: MediaStream): () => void {
  if (typeof window === "undefined") return () => {};

  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return () => {};

  const ctx = new Ctor();
  let source: MediaStreamAudioSourceNode | null = null;
  try {
    if (stream.getAudioTracks().length === 0) {
      void ctx.close().catch(() => {});
      return () => {};
    }
    source = ctx.createMediaStreamSource(stream);
    source.connect(ctx.destination);
  } catch {
    void ctx.close().catch(() => {});
    return () => {};
  }

  const resume = () => {
    void ctx.resume().catch(() => {});
  };
  resume();
  requestAnimationFrame(() => requestAnimationFrame(resume));

  const unlock = () => {
    resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);

  return () => {
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
    try {
      source?.disconnect();
    } catch {
      /* */
    }
    void ctx.close().catch(() => {});
  };
}
