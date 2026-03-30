"use client";

import { useEffect, useRef } from "react";

type MediaSurfaceProps = {
  stream?: MediaStream | null;
  muted?: boolean;
  className?: string;
};

export function MediaSurface({ stream, muted = false, className }: MediaSurfaceProps) {
  const ref = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.srcObject = stream ?? null;
    if (stream) {
      void video.play().catch(() => undefined);
    } else {
      video.pause();
    }
  }, [stream]);

  return (
    <video
      ref={ref}
      muted={muted}
      autoPlay
      playsInline
      className={className ?? "h-full w-full object-cover"}
    />
  );
}
