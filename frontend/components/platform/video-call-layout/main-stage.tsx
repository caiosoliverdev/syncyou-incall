"use client";

import { MonitorUp, UserRound } from "lucide-react";
import { useMemo } from "react";
import { MediaSurface } from "./media-surface";
import { useCallState } from "./call-state-context";
import { stageParticipantId, STAGE_AVATAR_PREFIX, STAGE_SCREEN_PREFIX } from "./types";

export function MainStage() {
  const { state } = useCallState();

  const content = useMemo(() => {
    const target = state.activeMain;

    if (target.startsWith(STAGE_SCREEN_PREFIX)) {
      const ownerId = stageParticipantId(target);
      const owner = state.participants.find((participant) => participant.id === ownerId);
      return {
        kind: "screen" as const,
        title: owner ? `${owner.name} está apresentando` : "Apresentação",
        stream: owner?.screenStream ?? null,
      };
    }

    if (target.startsWith(STAGE_AVATAR_PREFIX)) {
      const ownerId = stageParticipantId(target);
      const owner = state.participants.find((participant) => participant.id === ownerId);
      return {
        kind: "avatar" as const,
        title: owner?.name ?? "Participante",
        stream: null,
      };
    }

    const participant = state.participants.find((item) => item.id === target);
    return {
      kind: "camera" as const,
      title: participant?.name ?? "Participante",
      stream: participant?.cameraStream ?? participant?.stream ?? null,
    };
  }, [state.activeMain, state.participants]);

  const hasVideo = Boolean(
    content.stream?.getVideoTracks().some((track) => track.readyState === "live"),
  );

  return (
    <section className="relative h-full w-full overflow-hidden rounded-3xl border border-white/10 bg-neutral-950 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]">
      {hasVideo ? (
        <MediaSurface stream={content.stream} muted={false} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-neutral-300">
          {content.kind === "screen" ? <MonitorUp size={36} /> : <UserRound size={36} />}
          <span className="text-sm">{content.kind === "screen" ? "Sem feed de tela" : "Sem vídeo"}</span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/45 to-transparent p-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3 py-1 text-xs text-white">
          {content.title}
        </div>
      </div>
    </section>
  );
}
