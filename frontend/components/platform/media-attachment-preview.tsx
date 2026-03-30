"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { LoaderCircle, SendHorizonal, X } from "lucide-react";

const FILMSTRIP_FRAMES = 18;
const MIN_TRIM_SEC = 0.5;

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function extractFilmstrip(
  objectUrl: string,
  frameCount: number,
): Promise<{ thumbnails: string[]; duration: number }> {
  const video = document.createElement("video");
  video.src = objectUrl;
  video.muted = true;
  video.playsInline = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Falha ao carregar video"));
  });
  const duration = video.duration;
  const canvas = document.createElement("canvas");
  const w = 88;
  const h = 50;
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { thumbnails: [], duration };
  const thumbnails: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    const t = frameCount <= 1 ? 0 : (duration * i) / (frameCount - 1);
    video.currentTime = Math.min(t, Math.max(0, duration - 0.05));
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
    });
    ctx.drawImage(video, 0, 0, w, h);
    thumbnails.push(canvas.toDataURL("image/jpeg", 0.52));
  }
  return { thumbnails, duration };
}

/** Metadados do corte: o ficheiro original é enviado ao servidor, que aplica o corte com ffmpeg. */
export type MediaAttachmentSentPayload = {
  originalFile: File;
  trimStartSec: number;
  trimEndSec: number;
};

export type MediaAttachmentSentInfo = {
  caption: string;
  /** Só em vídeo: ficheiro original + intervalo para o backend cortar. */
  video?: MediaAttachmentSentPayload;
};

export type MediaAttachmentPreviewProps = {
  isDark: boolean;
  kind: "image" | "video" | "audio";
  file: File;
  objectUrl: string;
  onCancel: () => void;
  /** Imagem/áudio: só legenda. Vídeo: `video` com ficheiro original e tempos de corte. */
  onSent: (info: MediaAttachmentSentInfo) => void | Promise<void>;
};

export function MediaAttachmentPreview({
  isDark,
  kind,
  file,
  objectUrl,
  onCancel,
  onSent,
}: MediaAttachmentPreviewProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const trimStartRef = useRef(0);
  const trimEndRef = useRef(0);
  const [caption, setCaption] = useState("");
  const [filmstripLoading, setFilmstripLoading] = useState(kind === "video");
  const [audioTime, setAudioTime] = useState({ current: 0, duration: 0 });
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [duration, setDuration] = useState(0);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [drag, setDrag] = useState<"left" | "right" | null>(null);

  useEffect(() => {
    trimStartRef.current = trimStart;
  }, [trimStart]);
  useEffect(() => {
    trimEndRef.current = trimEnd;
  }, [trimEnd]);

  useEffect(() => {
    if (kind !== "video") return;
    let cancelled = false;
    setFilmstripLoading(true);
    void extractFilmstrip(objectUrl, FILMSTRIP_FRAMES)
      .then(({ thumbnails: t, duration: d }) => {
        if (cancelled) return;
        setThumbnails(t);
        setDuration(d);
        setTrimStart(0);
        setTrimEnd(d);
      })
      .catch(() => {
        if (!cancelled) setFilmstripLoading(false);
      })
      .finally(() => {
        if (!cancelled) setFilmstripLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, objectUrl]);

  const updateTrimFromClientX = useCallback(
    (clientX: number, which: "left" | "right") => {
      const el = stripRef.current;
      if (!el || duration <= 0) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const t = (x / rect.width) * duration;
      if (which === "left") {
        const max = trimEndRef.current - MIN_TRIM_SEC;
        setTrimStart(Math.min(Math.max(0, t), max));
      } else {
        const min = trimStartRef.current + MIN_TRIM_SEC;
        setTrimEnd(Math.max(Math.min(duration, t), min));
      }
    },
    [duration],
  );

  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      updateTrimFromClientX(e.clientX, drag);
    };
    const onUp = () => setDrag(null);
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [drag, updateTrimFromClientX]);

  useEffect(() => {
    if (kind !== "video") return;
    const v = previewVideoRef.current;
    if (!v) return;

    const applyPlay = () => {
      if (v.currentTime < trimStart - 0.05 || v.currentTime >= trimEnd - 0.05) {
        v.currentTime = trimStart;
      }
    };
    const onTime = () => {
      if (v.currentTime >= trimEnd - 0.05) {
        v.pause();
        v.currentTime = trimStart;
      }
    };

    v.addEventListener("play", applyPlay);
    v.addEventListener("timeupdate", onTime);

    const syncSeek = () => {
      v.currentTime = trimStart;
    };
    if (v.readyState >= 1) {
      syncSeek();
    } else {
      v.addEventListener("loadedmetadata", syncSeek, { once: true });
    }

    return () => {
      v.removeEventListener("play", applyPlay);
      v.removeEventListener("timeupdate", onTime);
    };
  }, [kind, objectUrl, trimStart, trimEnd]);

  const handleSend = async () => {
    const cap = caption.trim();
    if (kind === "image" || kind === "audio") {
      await Promise.resolve(onSent({ caption: cap }));
      return;
    }
    await Promise.resolve(
      onSent({
        caption: cap,
        video: {
          originalFile: file,
          trimStartSec: trimStartRef.current,
          trimEndSec: trimEndRef.current,
        },
      }),
    );
  };

  const leftPct = duration > 0 ? (trimStart / duration) * 100 : 0;
  const widthPct = duration > 0 ? ((trimEnd - trimStart) / duration) * 100 : 100;

  return (
    <div
      className={`flex w-full min-w-0 flex-col gap-2 rounded-2xl border p-2 shadow-lg ${
        isDark ? "border-zinc-600 bg-zinc-900" : "border-zinc-300 bg-white"
      }`}
    >
      {kind === "audio" ? (
        <p className={`text-center text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
          Ouça o audio antes de enviar
        </p>
      ) : null}

      {kind === "video" ? (
        <div className="space-y-1.5">
          <p className={`text-center text-[11px] ${isDark ? "text-zinc-500" : "text-zinc-500"}`}>
            Arraste as barras para escolher o trecho (o corte é feito no servidor)
          </p>
          <div
            ref={stripRef}
            className={`relative h-14 w-full overflow-hidden rounded-lg ${
              isDark ? "bg-zinc-800" : "bg-zinc-200"
            }`}
          >
            {filmstripLoading ? (
              <div className="flex h-full items-center justify-center gap-2">
                <LoaderCircle className="h-5 w-5 animate-spin text-emerald-500" />
                <span className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                  Gerando miniaturas...
                </span>
              </div>
            ) : (
              <>
                <div className="absolute inset-0 flex">
                  {thumbnails.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={i}
                      src={src}
                      alt=""
                      className="h-full min-w-0 flex-1 object-cover"
                      draggable={false}
                    />
                  ))}
                </div>
                <div
                  className="pointer-events-none absolute inset-y-0 left-0 bg-black/55"
                  style={{ width: `${leftPct}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 right-0 bg-black/55"
                  style={{ width: `${100 - leftPct - widthPct}%` }}
                />
                <div
                  className="pointer-events-none absolute inset-y-0 border-x-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                  style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                />
                <button
                  type="button"
                  aria-label="Inicio do corte"
                  className="absolute top-0 bottom-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none bg-white shadow-md"
                  style={{ left: `${leftPct}%` }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                    setDrag("left");
                  }}
                />
                <button
                  type="button"
                  aria-label="Fim do corte"
                  className="absolute top-0 bottom-0 z-10 w-3 -translate-x-1/2 cursor-ew-resize touch-none bg-white shadow-md"
                  style={{ left: `${leftPct + widthPct}%` }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
                    setDrag("right");
                  }}
                />
              </>
            )}
          </div>
          <div
            className={`flex justify-center gap-3 font-mono text-[11px] tabular-nums ${
              isDark ? "text-zinc-400" : "text-zinc-600"
            }`}
          >
            <span>
              {formatClock(trimStart)} — {formatClock(trimEnd)}
            </span>
            <span className={isDark ? "text-zinc-500" : "text-zinc-400"}>
              ({formatClock(Math.max(0, trimEnd - trimStart))})
            </span>
          </div>
        </div>
      ) : null}

      <div
        className={`relative flex max-h-[min(42vh,300px)] min-h-[140px] w-full items-center justify-center overflow-hidden rounded-xl ${
          isDark ? "bg-zinc-800" : "bg-zinc-100"
        }`}
      >
        {kind === "image" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={objectUrl} alt="" className="max-h-[min(42vh,300px)] w-full object-contain" />
        ) : kind === "audio" ? (
          <div className="flex w-full min-w-0 flex-col gap-2 px-1 py-1">
            <p
              className={`truncate text-center text-xs font-medium ${
                isDark ? "text-zinc-300" : "text-zinc-700"
              }`}
              title={file.name}
            >
              {file.name}
            </p>
            <audio
              key={objectUrl}
              src={objectUrl}
              controls
              className="w-full min-w-0"
              onLoadedMetadata={(e) => {
                const a = e.currentTarget;
                setAudioTime({
                  current: a.currentTime,
                  duration: Number.isFinite(a.duration) ? a.duration : 0,
                });
              }}
              onTimeUpdate={(e) => {
                const a = e.currentTarget;
                setAudioTime({
                  current: a.currentTime,
                  duration: Number.isFinite(a.duration) ? a.duration : 0,
                });
              }}
            />
            {audioTime.duration > 0 ? (
              <p
                className={`text-center font-mono text-[11px] tabular-nums ${
                  isDark ? "text-zinc-500" : "text-zinc-500"
                }`}
              >
                {formatClock(audioTime.current)} / {formatClock(audioTime.duration)}
              </p>
            ) : null}
          </div>
        ) : (
          <video
            key={objectUrl}
            ref={previewVideoRef}
            src={objectUrl}
            controls
            playsInline
            className="max-h-[min(42vh,300px)] w-full object-contain"
          />
        )}
      </div>

      <textarea
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        rows={2}
        placeholder="Adicionar legenda..."
        className={`w-full resize-none rounded-xl border px-3 py-2 text-sm outline-none ${
          isDark
            ? "border-zinc-600 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500"
            : "border-zinc-300 bg-zinc-50 text-zinc-900 placeholder:text-zinc-500"
        }`}
      />

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold ${
            isDark
              ? "border-zinc-600 bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
              : "border-zinc-300 bg-zinc-100 text-zinc-800 hover:bg-zinc-200"
          }`}
        >
          <X size={14} />
          Cancelar
        </button>
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={kind === "video" && filmstripLoading}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <SendHorizonal size={14} />
          Enviar
        </button>
      </div>
    </div>
  );
}
