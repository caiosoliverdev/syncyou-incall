"use client";

import { UserRound } from "lucide-react";
import { useMemo } from "react";
import { MediaSurface } from "./media-surface";
import { useCallState } from "./call-state-context";

export function SelfView() {
  const { state } = useCallState();
  const local = useMemo(
    () => state.participants.find((participant) => participant.isLocal),
    [state.participants],
  );

  const stream = local?.cameraOn ? local.cameraStream ?? local.stream ?? null : null;
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));

  return (
    <div className="absolute bottom-5 right-5 z-30 h-36 w-56 overflow-hidden rounded-2xl border border-white/15 bg-neutral-950/95 shadow-xl">
      {hasVideo ? (
        <MediaSurface stream={stream} muted className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-neutral-300">
          <UserRound size={24} />
          <span className="text-xs">Você</span>
        </div>
      )}
    </div>
  );
}
