"use client";

import { useEffect, useState } from "react";

const THRESHOLD = 9;

/**
 * Deteta fala no stream local (microfone) para efeito visual ao redor do avatar.
 */
export function useVoiceActivityFromStream(stream: MediaStream | null): boolean {
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    if (!stream) {
      const resetId = requestAnimationFrame(() => setSpeaking(false));
      return () => cancelAnimationFrame(resetId);
    }
    const track = stream.getAudioTracks()[0];
    if (!track || !track.enabled) {
      const resetId = requestAnimationFrame(() => setSpeaking(false));
      return () => cancelAnimationFrame(resetId);
    }

    let cancelled = false;
    let raf = 0;
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const data = new Uint8Array(analyser.frequencyBinCount);

    const tick = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i]!;
      const avg = sum / data.length;
      setSpeaking(avg > THRESHOLD);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      source.disconnect();
      analyser.disconnect();
      void ctx.close().catch(() => {});
    };
  }, [stream]);

  return speaking;
}
