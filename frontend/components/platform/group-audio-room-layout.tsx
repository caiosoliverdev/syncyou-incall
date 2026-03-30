"use client";

import Image from "next/image";
import { Mic, MicOff, MonitorUp, Pin } from "lucide-react";
import type { CallRoomParticipant } from "@/lib/call-events";
import { formatGroupRoleLabel } from "@/lib/group-role";
import { useMemo, useState } from "react";
import { MediaSurface } from "@/components/platform/video-call-layout/media-surface";

type GroupAudioRoomLayoutProps = {
  isDark: boolean;
  roomParticipants: CallRoomParticipant[];
  participantMediaById?: Record<
    string,
    {
      cameraStream?: MediaStream | null;
      screenStream?: MediaStream | null;
    }
  >;
  participantSpeakingById?: Record<string, boolean>;
  participantMicMutedById?: Record<string, boolean>;
  participantCameraOffById?: Record<string, boolean>;
};

type StageTarget = `${string}:camera` | `${string}:screen` | `${string}:profile`;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function hasLiveStream(stream?: MediaStream | null): boolean {
  return Boolean(stream?.getVideoTracks().some((track) => track.readyState === "live"));
}

export function GroupAudioRoomLayout({
  isDark,
  roomParticipants,
  participantMediaById = {},
  participantSpeakingById = {},
  participantMicMutedById = {},
  participantCameraOffById = {},
}: GroupAudioRoomLayoutProps) {
  const [activeStageTarget, setActiveStageTarget] = useState<StageTarget | null>(null);
  const fallbackSurfaceClass = isDark ? "bg-[#545454]" : "bg-[#f3f4f6]";
  const containSurfaceClass = isDark ? "bg-zinc-950" : "bg-slate-100";
  const stageOverlayClass = isDark
    ? "bg-gradient-to-t from-black/70 via-black/25 to-transparent"
    : "bg-gradient-to-t from-white/92 via-white/55 to-transparent";
  const cardOverlayClass = isDark
    ? "bg-gradient-to-t from-black/80 via-black/20 to-transparent"
    : "bg-gradient-to-t from-white/95 via-white/60 to-transparent";
  const stageTitleClass = isDark ? "text-white" : "text-zinc-900";
  const stageSubtitleClass = isDark ? "text-zinc-200/80" : "text-zinc-700";
  const cardTitleClass = isDark ? "text-white" : "text-zinc-900";
  const cardSubtitleClass = isDark ? "text-zinc-200/80" : "text-zinc-600";

  const participantCards = useMemo(
    () =>
      roomParticipants.map((participant) => {
        const media = participantMediaById[participant.id];
        const cameraStream =
          participantCameraOffById[participant.id] ? null : (media?.cameraStream ?? null);
        const screenStream = media?.screenStream ?? null;
        const hasScreen = hasLiveStream(screenStream);
        const hasCamera = hasLiveStream(cameraStream);
        const preferredTarget: StageTarget = hasScreen
          ? `${participant.id}:screen`
          : hasCamera
            ? `${participant.id}:camera`
            : `${participant.id}:profile`;
        return {
          participant,
          cameraStream,
          screenStream,
          hasScreen,
          hasCamera,
          previewStream: hasScreen ? screenStream : hasCamera ? cameraStream : null,
          preferredTarget,
          isSpeaking: Boolean(participantSpeakingById[participant.id]),
          isMicMuted: Boolean(participantMicMutedById[participant.id]),
        };
      }),
    [participantCameraOffById, participantMediaById, participantMicMutedById, participantSpeakingById, roomParticipants],
  );

  const availableTargets = useMemo(
    () => new Set(participantCards.map((item) => item.preferredTarget)),
    [participantCards],
  );

  const firstScreenTarget =
    participantCards.find((item) => item.hasScreen)?.preferredTarget ?? null;
  const fallbackCard =
    participantCards.find((item) => !item.participant.isYou) ?? participantCards[0] ?? null;
  const effectiveStageTarget =
    (activeStageTarget && availableTargets.has(activeStageTarget) ? activeStageTarget : null) ??
    firstScreenTarget ??
    fallbackCard?.preferredTarget ??
    null;

  const stageCard =
    participantCards.find((item) => item.preferredTarget === effectiveStageTarget) ?? fallbackCard;
  const stageParticipant = stageCard?.participant ?? null;
  const stageStream =
    effectiveStageTarget?.endsWith(":screen")
      ? (stageCard?.screenStream ?? null)
      : effectiveStageTarget?.endsWith(":camera")
        ? (stageCard?.cameraStream ?? null)
        : null;
  const stageIsScreen = Boolean(effectiveStageTarget?.endsWith(":screen"));
  const effectiveActiveParticipantId = stageParticipant?.id ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 py-4 sm:px-5 sm:py-5">
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.8fr)_260px]">
        <section
          className={`relative min-h-[260px] overflow-hidden rounded-[28px] border ${
            isDark
              ? "border-zinc-700/80 bg-zinc-950/80"
              : "border-zinc-200 bg-white/85 shadow-sm"
          }`}
        >
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="absolute left-[-6%] top-[10%] h-56 w-56 rounded-full bg-emerald-500/18 blur-3xl" />
            <div className="absolute right-[-8%] bottom-[-10%] h-64 w-64 rounded-full bg-lime-400/14 blur-3xl" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.16),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(132,204,22,0.10),transparent_32%)]" />
          </div>
          <div className="relative flex h-full min-h-[260px] flex-col px-4 py-4 sm:px-6 sm:py-6">
            <div
              className={`relative flex min-h-0 flex-1 overflow-hidden rounded-[24px] border ${
                stageCard?.isSpeaking
                  ? "border-emerald-400/90 shadow-[0_0_0_1px_rgba(52,211,153,0.3),0_0_34px_rgba(16,185,129,0.35)] ring-2 ring-emerald-400/45"
                  : isDark
                    ? "border-white/10"
                    : "border-zinc-200/90"
              } ${fallbackSurfaceClass}`}
            >
              {stageStream ? (
                <MediaSurface
                  stream={stageStream}
                  muted
                  className={`h-full w-full ${stageIsScreen ? `object-contain ${containSurfaceClass}` : "object-cover"}`}
                />
              ) : (
                <div className="relative flex h-full w-full flex-col items-center justify-center px-6 text-center">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.24),transparent_24%),radial-gradient(circle_at_70%_68%,rgba(34,197,94,0.18),transparent_28%)]"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute left-1/2 top-1/2 h-56 w-56 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/18 blur-3xl"
                  />
                  {stageParticipant?.avatarUrl ? (
                    <div className="relative mb-4 h-28 w-28 overflow-hidden rounded-full ring-4 ring-white/10 shadow-[0_0_40px_rgba(16,185,129,0.18)]">
                      <Image
                        src={stageParticipant.avatarUrl}
                        alt=""
                        fill
                        sizes="112px"
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div
                      className={`mb-4 flex h-28 w-28 items-center justify-center rounded-full border text-2xl font-semibold ${
                        isDark
                          ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                          : "border-emerald-300 bg-emerald-50 text-emerald-700"
                      }`}
                    >
                      {stageParticipant ? initials(stageParticipant.name) : <MonitorUp size={30} />}
                    </div>
                  )}
                  <h3 className="text-lg font-semibold sm:text-xl">
                    {stageParticipant?.name ?? "Palco da sala"}
                  </h3>
                  <p className={`mt-2 max-w-md text-sm ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                    {stageParticipant
                      ? formatGroupRoleLabel(stageParticipant.role)
                      : "Quando alguem compartilhar a tela, a apresentacao aparece aqui."}
                  </p>
                </div>
              )}

              {stageParticipant ? (
                <div
                  className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between ${stageOverlayClass} p-4`}
                >
                  <div>
                    <p className={`text-sm font-semibold sm:text-base ${stageTitleClass}`}>
                      {stageParticipant.name}
                    </p>
                    <p className={`text-xs ${stageSubtitleClass}`}>
                      {stageIsScreen ? "Compartilhando tela" : formatGroupRoleLabel(stageParticipant.role)}
                    </p>
                  </div>
                  {stageCard?.isMicMuted ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-xs text-amber-200 ring-1 ring-amber-400/30 backdrop-blur">
                      <MicOff size={12} />
                      mute
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </section>

        <aside
          className={`flex min-h-[260px] flex-col overflow-hidden rounded-[28px] border ${
            isDark
              ? "border-zinc-700/80 bg-zinc-950/75"
              : "border-zinc-200 bg-white/90 shadow-sm"
          }`}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <p
                className={`text-[10px] font-bold tracking-[0.22em] uppercase ${
                  isDark ? "text-emerald-400/90" : "text-emerald-700"
                }`}
              >
                Na sala
              </p>
              <p className={`text-xs ${isDark ? "text-zinc-400" : "text-zinc-600"}`}>
                Duplo clique envia para o palco
              </p>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-3">
            {participantCards.map((item) => (
              <button
                key={item.participant.id}
                type="button"
                onClick={() => setActiveStageTarget(item.preferredTarget)}
                onDoubleClick={() => setActiveStageTarget(item.preferredTarget)}
                className={`w-full overflow-hidden rounded-2xl border text-left transition-all hover:-translate-y-0.5 ${
                  effectiveActiveParticipantId === item.participant.id
                    ? "border-emerald-400 ring-2 ring-emerald-400/35 shadow-[0_0_0_1px_rgba(52,211,153,0.28)]"
                    : isDark
                      ? "border-zinc-700/80 bg-zinc-900/80"
                      : "border-zinc-200 bg-slate-50/90"
                }`}
              >
                <div className={`relative h-28 w-full overflow-hidden ${fallbackSurfaceClass}`}>
                  {item.previewStream ? (
                    <MediaSurface
                      stream={item.previewStream}
                      muted
                      className={`h-full w-full ${
                        item.hasScreen ? `object-contain ${containSurfaceClass}` : "object-cover"
                      }`}
                    />
                  ) : (
                    <div className="relative flex h-full w-full items-center justify-center">
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_28%,rgba(16,185,129,0.22),transparent_24%),radial-gradient(circle_at_72%_70%,rgba(34,197,94,0.16),transparent_28%)]" />
                      <div className="absolute left-1/2 top-1/2 h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/20 blur-2xl" />
                      {item.participant.avatarUrl ? (
                        <div className="relative h-16 w-16 overflow-hidden rounded-full ring-2 ring-white/10">
                          <Image
                            src={item.participant.avatarUrl}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <div
                          className={`relative flex h-16 w-16 items-center justify-center rounded-full text-base font-semibold ${
                            item.participant.isYou
                              ? "bg-emerald-600 text-white"
                              : isDark
                                ? "bg-[#545454] text-zinc-100"
                                : "bg-[#545454] text-white"
                          }`}
                        >
                          {initials(item.participant.name)}
                        </div>
                      )}
                    </div>
                  )}
                  {item.isSpeaking ? (
                    <>
                      <div className="pointer-events-none absolute -inset-1 rounded-[inherit] bg-emerald-400/15 blur-md" />
                      <div className="pointer-events-none absolute inset-0 rounded-[inherit] ring-2 ring-emerald-400/90 shadow-[0_0_24px_rgba(16,185,129,0.5)]" />
                    </>
                  ) : null}
                  <div
                    className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between ${cardOverlayClass} px-3 py-2`}
                  >
                    <div className="min-w-0">
                      <p className={`truncate text-sm font-semibold ${cardTitleClass}`}>
                        {item.participant.name}
                      </p>
                      <p className={`truncate text-[11px] ${cardSubtitleClass}`}>
                        {item.hasScreen
                          ? "Compartilhando tela"
                          : formatGroupRoleLabel(item.participant.role)}
                      </p>
                    </div>
                    <div className="ml-2 flex items-center gap-1.5">
                      {item.isMicMuted ? (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-amber-200 ring-1 ring-amber-400/30 backdrop-blur">
                          <MicOff size={13} />
                        </span>
                      ) : (
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-black/45 text-emerald-200 ring-1 ring-white/10 backdrop-blur">
                          <Mic size={13} />
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-[11px]">
                  <span className={isDark ? "text-zinc-500" : "text-zinc-600"}>
                    {item.participant.isYou ? "Você" : "Na chamada"}
                  </span>
                  {effectiveActiveParticipantId === item.participant.id ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-emerald-300">
                      <Pin size={10} /> no palco
                    </span>
                  ) : null}
                </div>
              </button>
            ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
