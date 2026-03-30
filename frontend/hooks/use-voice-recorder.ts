"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type VoicePhase = "idle" | "recording" | "preview";

export const WAVE_DISPLAY_BARS = 92;

const LEVEL_PUSH_INTERVAL_MS = 60;

/** Padding à esquerda (silêncio) para a onda “começar” na direita e ir preenchendo para a esquerda. */
export function padWaveformRight(samples: number[], width: number): number[] {
  const tail = samples.length > width ? samples.slice(-width) : samples;
  const pad = width - tail.length;
  if (pad <= 0) return tail;
  return [...Array(pad).fill(0.06), ...tail];
}

/** Encaixa qualquer quantidade de amostras na largura fixa (útil no preview). */
export function resampleWaveform(samples: number[], targetLen: number): number[] {
  if (samples.length === 0) return Array(targetLen).fill(0.08);
  if (samples.length === targetLen) return [...samples];
  if (samples.length < targetLen) return padWaveformRight(samples, targetLen);
  const out: number[] = [];
  const step = samples.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const a = Math.floor(i * step);
    const b = Math.floor((i + 1) * step);
    let sum = 0;
    for (let j = a; j < b; j++) sum += samples[j] ?? 0;
    out.push(sum / Math.max(1, b - a));
  }
  return out;
}

export function formatVoiceDuration(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function useVoiceRecorder() {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [recordingMs, setRecordingMs] = useState(0);
  /** Amostras em ordem temporal (mais recente no final). */
  const [recordingSamples, setRecordingSamples] = useState<number[]>([]);
  /** Snapshot ao concluir (para o preview mostrar a mesma forma). */
  const [previewWaveform, setPreviewWaveform] = useState<number[] | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recordingSamplesRef = useRef<number[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const previewBlobRef = useRef<Blob | null>(null);
  const previewMimeRef = useRef<string>("audio/webm");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number>(0);
  const recordingStartedAtRef = useRef<number>(0);
  const discardRecordingRef = useRef(false);
  const lastLevelPushAtRef = useRef(0);

  const recordingDisplayBars = useMemo(
    () => padWaveformRight(recordingSamples, WAVE_DISPLAY_BARS),
    [recordingSamples],
  );

  const previewDisplayBars = useMemo(() => {
    if (!previewWaveform || previewWaveform.length === 0) return null;
    return resampleWaveform(previewWaveform, WAVE_DISPLAY_BARS);
  }, [previewWaveform]);

  const stopAnalyserLoop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
  }, []);

  const cleanupStreamOnly = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const closeAudioContext = useCallback(async () => {
    if (audioContextRef.current) {
      try {
        await audioContextRef.current.close();
      } catch {
        /* ignore */
      }
      audioContextRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  const clearRecordingWave = useCallback(() => {
    recordingSamplesRef.current = [];
    setRecordingSamples([]);
  }, []);

  const clearPreviewWave = useCallback(() => {
    setPreviewWaveform(null);
  }, []);

  const startRecording = useCallback(async () => {
    setErrorMessage(null);
    if (phase !== "idle") return;
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setErrorMessage("Gravacao de audio nao disponivel neste ambiente.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ];
      const mimeType = mimeCandidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      discardRecordingRef.current = false;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        stopAnalyserLoop();
        cleanupStreamOnly();
        void closeAudioContext();
        if (discardRecordingRef.current) {
          discardRecordingRef.current = false;
          clearRecordingWave();
          clearPreviewWave();
          setRecordingMs(0);
          setPhase("idle");
          return;
        }
        const raw = [...recordingSamplesRef.current];
        setPreviewWaveform(raw.length > 0 ? raw : [0.1]);
        clearRecordingWave();
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        audioChunksRef.current = [];
        previewBlobRef.current = blob;
        previewMimeRef.current = recorder.mimeType || "audio/webm";
        const url = URL.createObjectURL(blob);
        setPreviewUrl((previous) => {
          if (previous) URL.revokeObjectURL(previous);
          return url;
        });
        setRecordingMs(0);
        setPhase("preview");
      };

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.65;
      source.connect(analyser);
      analyserRef.current = analyser;

      recordingStartedAtRef.current = Date.now();
      lastLevelPushAtRef.current = 0;
      clearRecordingWave();
      setRecordingMs(0);
      setPhase("recording");

      const tick = () => {
        setRecordingMs(Date.now() - recordingStartedAtRef.current);
        const node = analyserRef.current;
        if (node) {
          const now = Date.now();
          if (now - lastLevelPushAtRef.current >= LEVEL_PUSH_INTERVAL_MS) {
            lastLevelPushAtRef.current = now;
            const data = new Uint8Array(node.frequencyBinCount);
            node.getByteFrequencyData(data);
            let sum = 0;
            for (let i = 0; i < data.length; i++) sum += data[i] ?? 0;
            const avg = sum / data.length / 255;
            const intensity = Math.min(1, Math.max(0.05, avg * 2.4));
            setRecordingSamples((prev) => {
              const next = [...prev, intensity];
              recordingSamplesRef.current = next;
              return next;
            });
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);

      recorder.start(120);
    } catch {
      setErrorMessage("Nao foi possivel acessar o microfone.");
      cleanupStreamOnly();
      void closeAudioContext();
      stopAnalyserLoop();
    }
  }, [
    phase,
    cleanupStreamOnly,
    closeAudioContext,
    clearRecordingWave,
    clearPreviewWave,
    stopAnalyserLoop,
  ]);

  const cancelRecording = useCallback(() => {
    if (phase === "recording" && mediaRecorderRef.current) {
      discardRecordingRef.current = true;
      stopAnalyserLoop();
      try {
        mediaRecorderRef.current.stop();
      } catch {
        discardRecordingRef.current = false;
        cleanupStreamOnly();
        void closeAudioContext();
        clearRecordingWave();
        clearPreviewWave();
        setRecordingMs(0);
        setPhase("idle");
      }
      return;
    }
    if (phase === "preview") {
      previewBlobRef.current = null;
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      clearPreviewWave();
      setPhase("idle");
    }
  }, [phase, cleanupStreamOnly, closeAudioContext, clearRecordingWave, clearPreviewWave, stopAnalyserLoop]);

  const finishRecording = useCallback(() => {
    if (phase !== "recording" || !mediaRecorderRef.current) return;
    stopAnalyserLoop();
    try {
      mediaRecorderRef.current.stop();
    } catch {
      /* ignore */
    }
  }, [phase, stopAnalyserLoop]);

  const discardPreview = useCallback(() => {
    previewBlobRef.current = null;
    setPreviewUrl((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return null;
    });
    clearPreviewWave();
    setPhase("idle");
  }, [clearPreviewWave]);

  const sendPreview = useCallback(
    (onSend?: (blob: Blob, mimeType: string) => void | Promise<void>) => {
      const blob = previewBlobRef.current;
      const mime = previewMimeRef.current;
      previewBlobRef.current = null;
      if (onSend && blob) {
        void Promise.resolve(onSend(blob, mime));
      }
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
      clearPreviewWave();
      setPhase("idle");
    },
    [clearPreviewWave],
  );

  useEffect(() => {
    return () => {
      stopAnalyserLoop();
      cleanupStreamOnly();
      void closeAudioContext();
      setPreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return null;
      });
    };
  }, [cleanupStreamOnly, closeAudioContext, stopAnalyserLoop]);

  return {
    phase,
    recordingMs,
    recordingDisplayBars,
    previewDisplayBars,
    previewUrl,
    errorMessage,
    setErrorMessage,
    startRecording,
    cancelRecording,
    finishRecording,
    discardPreview,
    sendPreview,
  };
}
