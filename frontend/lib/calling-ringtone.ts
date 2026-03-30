/**
 * Toque de chamada em loop usando `public/song.mp3` ate chamar stop().
 */
const CALL_RINGTONE_SRC = "/song.mp3";

export function startCallingRingtone(): () => void {
  const audio = new Audio(CALL_RINGTONE_SRC);
  audio.loop = true;
  audio.volume = 0.85;

  const tryPlay = () => {
    void audio.play().catch(() => {});
  };

  tryPlay();
  document.addEventListener("pointerdown", tryPlay, { passive: true });
  window.addEventListener("focus", tryPlay);

  return () => {
    document.removeEventListener("pointerdown", tryPlay);
    window.removeEventListener("focus", tryPlay);
    audio.pause();
    audio.src = "";
    audio.load();
  };
}
