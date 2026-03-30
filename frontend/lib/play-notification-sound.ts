import { getFeatureFlag } from "@/lib/feature-flags";

/** Áudio em `public/notifica-mensagem-notificacoes.mp3` — notificações da app e novas mensagens. */
const NOTIFICATION_SOUND_SRC = "/notifica-mensagem-notificacoes.mp3";

const VOLUME = 0.58;
const MIN_GAP_MS = 900;

let cachedAudio: HTMLAudioElement | null = null;
let lastPlayAt = 0;

function getAudio(): HTMLAudioElement | null {
  if (typeof window === "undefined") return null;
  if (!cachedAudio) {
    cachedAudio = new Audio(NOTIFICATION_SOUND_SRC);
    cachedAudio.preload = "auto";
    cachedAudio.volume = VOLUME;
  }
  return cachedAudio;
}

export function playNotificationChime(): void {
  const el = getAudio();
  if (!el) return;
  if (getFeatureFlag("notificationSoundDebounce")) {
    const now = Date.now();
    if (now - lastPlayAt < MIN_GAP_MS) return;
    lastPlayAt = now;
  }
  try {
    el.volume = VOLUME;
    el.currentTime = 0;
    void el.play().catch(() => {
      /* política de autoplay ou sem interação */
    });
  } catch {
    /* ignorar */
  }
}
