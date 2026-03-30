"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Pause, Play } from "lucide-react";

const SPEEDS = [1, 2, 3] as const;

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type ChatAudioPlayerProps = {
  src: string;
  isDark: boolean;
  outgoing: boolean;
};

export function ChatAudioPlayer({ src, isDark, outgoing }: ChatAudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [current, setCurrent] = useState(0);
  const [rate, setRate] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setCurrent(el.currentTime);
    const onMeta = () => {
      const d = el.duration;
      setDuration(Number.isFinite(d) ? d : 0);
    };
    const onEnded = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("durationchange", onMeta);
    el.addEventListener("ended", onEnded);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    return () => {
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("durationchange", onMeta);
      el.removeEventListener("ended", onEnded);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
    };
  }, [src]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.playbackRate = rate;
  }, [rate]);

  const togglePlay = useCallback(async () => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
    } else {
      try {
        await el.play();
      } catch {
        /* ignore */
      }
    }
  }, [playing]);

  const onSeek = useCallback((value: number) => {
    const el = audioRef.current;
    if (!el) return;
    el.currentTime = value;
    setCurrent(value);
  }, []);

  const trackBg = outgoing
    ? isDark
      ? "bg-emerald-950/80"
      : "bg-emerald-200/60"
    : isDark
      ? "bg-zinc-800"
      : "bg-zinc-200";

  const rangeAccent = outgoing
    ? isDark
      ? "accent-emerald-400"
      : "accent-emerald-600"
    : isDark
      ? "accent-zinc-400"
      : "accent-emerald-600";

  const labelClass = outgoing
    ? isDark
      ? "text-emerald-200/85"
      : "text-emerald-900/75"
    : isDark
      ? "text-zinc-400"
      : "text-zinc-500";

  const micClass = outgoing
    ? isDark
      ? "text-emerald-300/70"
      : "text-emerald-800/60"
    : isDark
      ? "text-zinc-500"
      : "text-zinc-400";

  const speedActive = outgoing
    ? isDark
      ? "bg-emerald-700 text-emerald-50"
      : "bg-emerald-600 text-white"
    : isDark
      ? "bg-zinc-600 text-zinc-100"
      : "bg-emerald-600 text-white";

  const speedIdle = outgoing
    ? isDark
      ? "text-emerald-200/75 hover:bg-emerald-950/50"
      : "text-emerald-900/70 hover:bg-emerald-100/90"
    : isDark
      ? "text-zinc-400 hover:bg-zinc-800"
      : "text-zinc-600 hover:bg-zinc-200";

  const playBtnClass = outgoing
    ? isDark
      ? "bg-emerald-700 text-emerald-50 hover:bg-emerald-600"
      : "bg-emerald-600 text-white hover:bg-emerald-500"
    : isDark
      ? "bg-zinc-700 text-zinc-100 hover:bg-zinc-600"
      : "bg-emerald-600 text-white hover:bg-emerald-500";

  return (
    <div className="flex w-full min-w-[min(100%,220px)] flex-wrap items-center gap-x-1.5 gap-y-1">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />

      <Mic size={13} className={`shrink-0 ${micClass}`} aria-hidden />

      <button
        type="button"
        onClick={() => void togglePlay()}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition ${playBtnClass}`}
        aria-label={playing ? "Pausar" : "Reproduzir"}
      >
        {playing ? <Pause size={14} /> : <Play size={14} className="ml-px" />}
      </button>

      <div className="flex min-w-[100px] flex-1 flex-col gap-0">
        <input
          type="range"
          min={0}
          max={duration > 0 ? duration : 1}
          step={0.1}
          value={Math.min(current, duration > 0 ? duration : 1)}
          onChange={(e) => onSeek(Number(e.target.value))}
          className={`h-1 w-full cursor-pointer rounded-full ${rangeAccent} ${trackBg}`}
          aria-label="Posicao no audio"
        />
      </div>

      <span
        className={`shrink-0 font-mono text-[10px] tabular-nums leading-none ${labelClass}`}
        aria-live="polite"
      >
        {formatTime(current)} / {formatTime(duration)}
      </span>

      <div className="flex shrink-0 gap-0.5">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRate(s)}
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none transition ${
              rate === s ? speedActive : speedIdle
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
