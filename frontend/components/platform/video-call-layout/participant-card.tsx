"use client";

import { MonitorUp, UserRound } from "lucide-react";
import { MediaSurface } from "./media-surface";
import type { StageTarget } from "./types";

type ParticipantCardProps = {
  label: string;
  stageTarget: StageTarget;
  active: boolean;
  stream?: MediaStream | null;
  isScreen?: boolean;
  onClick: (stageTarget: StageTarget) => void;
};

export function ParticipantCard({
  label,
  stageTarget,
  active,
  stream,
  isScreen = false,
  onClick,
}: ParticipantCardProps) {
  const hasStream = Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));

  return (
    <button
      type="button"
      onClick={() => onClick(stageTarget)}
      className={[
        "group relative w-full overflow-hidden rounded-2xl border bg-neutral-950/80 text-left transition-all",
        "hover:-translate-y-0.5 hover:border-violet-400/70",
        active ? "border-violet-400 ring-2 ring-violet-400/40" : "border-white/10",
      ].join(" ")}
    >
      <div className="relative h-24 w-full bg-neutral-900">
        {hasStream ? (
          <MediaSurface stream={stream} muted className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-neutral-300">
            {isScreen ? <MonitorUp size={22} /> : <UserRound size={22} />}
          </div>
        )}
      </div>
      <div className="flex items-center justify-between px-3 py-2 text-xs">
        <span className="truncate text-neutral-100">{label}</span>
        {isScreen ? (
          <span className="rounded-full bg-emerald-600/20 px-2 py-0.5 text-[10px] text-emerald-300">
            compartilhando
          </span>
        ) : null}
      </div>
    </button>
  );
}
