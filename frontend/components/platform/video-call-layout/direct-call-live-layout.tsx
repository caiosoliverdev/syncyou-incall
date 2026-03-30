"use client";

import { Maximize2, MicOff, Minimize2, MonitorUp, Pin, PinOff, UserRound } from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  type LayoutState,
  resolveLayoutMode,
  resolveMainStage as resolveMainStageByRules,
  resolveSelfView,
  resolveSidebarItems,
} from "./layout-resolvers";
import { MediaSurface } from "./media-surface";
import { isScreenCaptureTrack } from "@/lib/direct-voice-call-audio";
import { isStageTargetValid, resolveMainStage } from "./resolve-main-stage";
import {
  type CallState,
  stageParticipantId,
  STAGE_AVATAR_PREFIX,
  STAGE_SCREEN_PREFIX,
  type StageTarget,
} from "./types";

type DirectCallLiveLayoutProps = {
  isDark: boolean;
  peerName: string;
  peerAvatarUrl?: string | null;
  peerRemoteSpeaking?: boolean;
  peerRemoteMicMuted?: boolean;
  peerRemoteCameraOff?: boolean;
  localCameraStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  remoteCameraStream?: MediaStream | null;
  remoteScreenStream?: MediaStream | null;
  activeMain?: StageTarget | null;
  onActiveMainChange?: (target: StageTarget) => void;
  /** Quando definido com `onPinnedMainChange`, o pin é controlado pelo parent (ex.: hook da chamada). */
  pinnedMain?: StageTarget | null;
  onPinnedMainChange?: (target: StageTarget | null) => void;
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function hasLive(stream?: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some((t) => t.readyState === "live");
}

function hasLiveCamera(stream?: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some(
    (t) => t.readyState === "live" && !isScreenCaptureTrack(t),
  );
}

function hasLiveScreen(stream?: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some((t) => t.readyState === "live");
}

function hasInferredScreen(stream?: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some(
    (t) => t.readyState === "live" && isScreenCaptureTrack(t),
  );
}

function pickScreenStream(
  preferredScreenStream?: MediaStream | null,
  fallbackCandidate?: MediaStream | null,
): MediaStream | null {
  if (hasLiveScreen(preferredScreenStream)) return preferredScreenStream ?? null;
  if (hasInferredScreen(fallbackCandidate)) return fallbackCandidate ?? null;
  return null;
}

export function DirectCallLiveLayout({
  isDark,
  peerName,
  peerAvatarUrl = null,
  peerRemoteSpeaking = false,
  peerRemoteMicMuted = false,
  peerRemoteCameraOff = false,
  localCameraStream = null,
  localScreenStream = null,
  remoteCameraStream = null,
  remoteScreenStream = null,
  activeMain: controlledActiveMain,
  onActiveMainChange,
  pinnedMain: controlledPinnedMain,
  onPinnedMainChange,
}: DirectCallLiveLayoutProps) {
  const callState = useMemo<CallState>(() => {
    const localResolvedScreenStream = pickScreenStream(localScreenStream, localCameraStream);
    const remoteResolvedScreenStream = pickScreenStream(remoteScreenStream, remoteCameraStream);
    const participants = [
      {
        id: "local",
        name: "Você",
        isLocal: true,
        cameraOn: hasLiveCamera(localCameraStream),
        screenSharing: hasLiveScreen(localResolvedScreenStream),
        cameraStream: localCameraStream,
        screenStream: localResolvedScreenStream,
      },
      {
        id: "remote",
        name: peerName,
        isLocal: false,
        cameraOn: !peerRemoteCameraOff && hasLiveCamera(remoteCameraStream),
        screenSharing: hasLiveScreen(remoteResolvedScreenStream),
        cameraStream: remoteCameraStream,
        screenStream: remoteResolvedScreenStream,
        avatarUrl: peerAvatarUrl,
      },
    ];
    const state: CallState = {
      participants,
      activeMain: "remote",
      screenShareOwnerId: participants.find((p) => p.screenSharing)?.id,
    };
    return { ...state, activeMain: resolveMainStage(state) };
  }, [
    localCameraStream,
    localScreenStream,
    peerName,
    peerRemoteCameraOff,
    peerAvatarUrl,
    remoteCameraStream,
    remoteScreenStream,
  ]);

  const [uncontrolledActiveMain, setUncontrolledActiveMain] = useState<StageTarget>(() =>
    resolveMainStage(callState),
  );
  const [internalPinned, setInternalPinned] = useState<StageTarget | null>(null);
  const [selfSwapTarget, setSelfSwapTarget] = useState<StageTarget | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const pinnedTarget =
    onPinnedMainChange != null ? (controlledPinnedMain ?? null) : internalPinned;
  const selectedActiveMain = controlledActiveMain ?? uncontrolledActiveMain ?? null;

  const layoutState = useMemo<LayoutState>(
    () => ({
      participants: callState.participants.map((p) => ({
        id: p.id,
        isLocal: p.isLocal,
        camera: { type: "camera", active: Boolean(p.cameraOn) },
        screen: { type: "screen", active: Boolean(p.screenSharing) },
      })),
      selectedMain: selectedActiveMain,
      pinnedMain: pinnedTarget,
      selfSwapTarget,
    }),
    [callState.participants, pinnedTarget, selectedActiveMain, selfSwapTarget],
  );
  const layoutMode = resolveLayoutMode(layoutState);
  const effectiveActiveMain = resolveMainStageByRules(layoutState);
  const pinApplies = pinnedTarget != null && effectiveActiveMain === pinnedTarget;
  const isPinnedActive = pinApplies;

  /** Remove pin órfão do estado (ex.: parou screen share com pin na tela). */
  useEffect(() => {
    if (pinnedTarget == null) return;
    if (isStageTargetValid(callState, pinnedTarget)) return;
    const id = window.setTimeout(() => {
      if (onPinnedMainChange != null) {
        onPinnedMainChange(null);
      } else {
        setInternalPinned(null);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [callState, pinnedTarget, onPinnedMainChange]);

  /** Mantém seleção externa/interna alinhada quando o target atual expira. */
  useEffect(() => {
    if (pinApplies) return;
    if (isStageTargetValid(callState, selectedActiveMain)) return;
    const fallback = resolveMainStageByRules(layoutState);
    const id = window.setTimeout(() => {
      if (controlledActiveMain != null) {
        onActiveMainChange?.(fallback);
      } else {
        setUncontrolledActiveMain(fallback);
      }
    }, 0);
    return () => window.clearTimeout(id);
  }, [
    callState,
    pinApplies,
    selectedActiveMain,
    layoutState,
    controlledActiveMain,
    onActiveMainChange,
  ]);

  const screenActive = layoutMode === "screen-share";
  const effectiveSidebarCollapsed = screenActive ? sidebarCollapsed : false;

  const mainContent = useMemo(() => {
    if (effectiveActiveMain.startsWith(STAGE_SCREEN_PREFIX)) {
      const ownerId = stageParticipantId(effectiveActiveMain);
      const owner = callState.participants.find((p) => p.id === ownerId);
      return {
        kind: "screen" as const,
        title: owner ? `${owner.name} está apresentando` : "Apresentação",
        stream: owner?.screenStream ?? null,
      };
    }
    if (effectiveActiveMain.startsWith(STAGE_AVATAR_PREFIX)) {
      const ownerId = stageParticipantId(effectiveActiveMain);
      const owner = callState.participants.find((p) => p.id === ownerId);
      return {
        kind: "avatar" as const,
        title: owner?.name ?? "Participante",
        stream: null,
      };
    }
    const participant = callState.participants.find((p) => p.id === effectiveActiveMain);
    return {
      kind: "camera" as const,
      title: participant?.name ?? "Participante",
      stream: participant?.cameraStream ?? null,
    };
  }, [callState.participants, effectiveActiveMain]);

  const local = callState.participants.find((p) => p.isLocal)!;
  const remote = callState.participants.find((p) => !p.isLocal)!;
  const sidebarItems = resolveSidebarItems(layoutState);
  const cards = sidebarItems.map((item) => {
    const isLocalItem = item.participantId === local.id;
    const participant = isLocalItem ? local : remote;
    const labelBase = isLocalItem ? "Você" : peerName;
    if (item.kind === "screen") {
      return {
        id: item.id,
        label: `${labelBase} (tela)`,
        stream: isLocalItem ? local.screenStream : remote.screenStream,
        isScreen: true,
        isLocal: isLocalItem,
        remoteMicMuted: !isLocalItem && peerRemoteMicMuted,
      };
    }
    if (item.kind === "camera") {
      return {
        id: item.id,
        label: `${labelBase} (câmera)`,
        stream: participant.cameraStream,
        isScreen: false,
        isLocal: isLocalItem,
        remoteMicMuted: !isLocalItem && peerRemoteMicMuted,
      };
    }
    return {
      id: item.id,
      label: labelBase,
      stream: null,
      isScreen: false,
      isLocal: isLocalItem,
      remoteMicMuted: !isLocalItem && peerRemoteMicMuted,
    };
  }) as Array<{
    id: StageTarget;
    label: string;
    stream?: MediaStream | null;
    isScreen: boolean;
    isLocal: boolean;
    remoteMicMuted: boolean;
  }>;

  const selfViewTarget = resolveSelfView(layoutState);
  const selfViewStream =
    !selfViewTarget
      ? null
      : selfViewTarget === local.id
        ? (local.cameraStream ?? null)
        : selfViewTarget === remote.id
          ? (remote.cameraStream ?? null)
          : null;

  const mainHasVideo = hasLive(mainContent.stream);
  const mainParticipantId = effectiveActiveMain.startsWith(STAGE_SCREEN_PREFIX) ||
    effectiveActiveMain.startsWith(STAGE_AVATAR_PREFIX)
      ? stageParticipantId(effectiveActiveMain)
      : effectiveActiveMain;
  const selectActiveMain = (target: StageTarget) => {
    // While pinned, simple click on a different card must NOT replace main stage.
    if (pinApplies && pinnedTarget != null && target !== pinnedTarget) {
      return;
    }
    onActiveMainChange?.(target);
    if (controlledActiveMain == null) {
      setUncontrolledActiveMain(target);
    }
  };
  const setPinnedTarget = (next: StageTarget | null) => {
    onPinnedMainChange?.(next);
    if (onPinnedMainChange == null) {
      setInternalPinned(next);
    }
  };
  const togglePin = (target: StageTarget) => {
    setPinnedTarget(pinnedTarget === target ? null : target);
    selectActiveMain(target);
  };
  const handleSelfViewDoubleClick = () => {
    if (!selfViewTarget) return;
    const prevMain = effectiveActiveMain;
    selectActiveMain(selfViewTarget);
    setSelfSwapTarget(prevMain);
  };

  return (
    <div className="relative flex min-h-[200px] flex-1 overflow-hidden p-3 sm:p-5">
      <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl shadow-inner ring-1 ring-white/10">
        <div
          key={effectiveActiveMain}
          className="h-full w-full animate-in fade-in zoom-in-95 duration-200"
        >
          {mainHasVideo ? (
            <MediaSurface
              stream={mainContent.stream}
              muted={false}
              className={`h-full w-full ${mainContent.kind === "screen" ? "bg-zinc-950 object-contain" : "object-cover"}`}
            />
          ) : mainContent.kind === "avatar" && peerAvatarUrl ? (
            <div className="flex h-full w-full items-center justify-center">
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 overflow-hidden"
              >
                <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-emerald-500/20 blur-3xl animate-pulse" />
                <div
                  className="absolute right-[-90px] bottom-[-40px] h-80 w-80 rounded-full bg-green-400/15 blur-3xl animate-pulse"
                  style={{ animationDelay: "500ms" }}
                />
                <div
                  className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-lime-400/10 blur-3xl animate-pulse"
                  style={{ animationDelay: "900ms" }}
                />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(16,185,129,0.18),transparent_35%),radial-gradient(circle_at_80%_70%,rgba(34,197,94,0.12),transparent_35%)]" />
              </div>
              <div className="relative h-44 w-44 overflow-hidden rounded-full ring-4 ring-white/15 shadow-2xl">
                <Image src={peerAvatarUrl} alt="" fill sizes="176px" className="object-cover" />
              </div>
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-zinc-900/40 text-zinc-300">
              {mainContent.kind === "screen" ? <MonitorUp size={34} /> : <UserRound size={34} />}
            </div>
          )}
        </div>
        {effectiveActiveMain === "remote" && peerRemoteSpeaking ? (
          <div
            className="pointer-events-none absolute inset-0 rounded-2xl transition-opacity duration-300"
            style={{ boxShadow: "inset 0 0 72px rgba(45,212,191,0.28)" }}
            aria-hidden
          />
        ) : null}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/15 bg-black/45 px-3 py-1 text-xs text-white">
          {mainContent.title}
        </div>
        {mainParticipantId === remote.id && peerRemoteMicMuted ? (
          <div className="pointer-events-none absolute left-3 top-12 rounded-full border border-amber-400/35 bg-black/55 px-2.5 py-1 text-[11px] text-amber-200">
            <span className="inline-flex items-center gap-1">
              <MicOff size={12} /> microfone desligado
            </span>
          </div>
        ) : null}
        {isPinnedActive || screenActive ? (
          <div className="pointer-events-none absolute right-3 top-3 rounded-full border border-white/15 bg-black/45 px-2.5 py-1 text-[11px] text-white">
            {isPinnedActive ? (
              <span className="inline-flex items-center gap-1">
                <Pin size={12} /> palco fixado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 opacity-85">
                <PinOff size={12} /> duplo clique fixa
              </span>
            )}
          </div>
        ) : null}
        {screenActive ? (
          <button
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            className="absolute bottom-3 right-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white transition hover:bg-black/70"
            aria-label={effectiveSidebarCollapsed ? "Mostrar cards da apresentação" : "Ocultar cards da apresentação"}
            title={effectiveSidebarCollapsed ? "Mostrar cards" : "Ocultar cards"}
          >
            {effectiveSidebarCollapsed ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        ) : null}
      </div>

      {selfViewTarget ? (
        <button
          type="button"
          onDoubleClick={handleSelfViewDoubleClick}
          className={`absolute bottom-5 right-5 z-30 h-28 w-44 overflow-hidden rounded-2xl border bg-zinc-950/90 shadow-xl ring-1 ring-black/20 transition-all ${
            selfViewTarget === remote.id && peerRemoteSpeaking
              ? "border-emerald-400/80 shadow-[0_0_0_2px_rgba(52,211,153,0.24),0_0_24px_rgba(16,185,129,0.35)] animate-pulse"
              : "border-white/15"
          }`}
          title="Duplo clique para promover ao palco"
        >
          {selfViewStream ? (
            <MediaSurface stream={selfViewStream} muted className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-zinc-300">
              <UserRound size={20} />
            </div>
          )}
        </button>
      ) : null}

      {screenActive && !effectiveSidebarCollapsed ? (
        <aside
          className="ml-4 w-64 shrink-0 animate-in slide-in-from-right-4 fade-in duration-300"
        >
          <div
            className={`h-full space-y-3 overflow-auto rounded-2xl border p-3 backdrop-blur ${
              isDark ? "border-zinc-700/70 bg-zinc-900/70" : "border-zinc-300/70 bg-white/75"
            }`}
          >
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => selectActiveMain(card.id)}
                onDoubleClick={() => togglePin(card.id)}
                className={`w-full overflow-hidden rounded-xl border text-left transition-all duration-200 hover:-translate-y-0.5 ${
                  !card.isLocal && peerRemoteSpeaking
                    ? "border-emerald-400/80 ring-2 ring-emerald-400/40 shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_22px_rgba(16,185,129,0.18)]"
                    : effectiveActiveMain === card.id
                    ? "border-emerald-400 ring-2 ring-emerald-400/40 shadow-[0_0_0_1px_rgba(52,211,153,0.35)]"
                    : isDark
                      ? "border-zinc-700 bg-zinc-950/60"
                      : "border-zinc-300 bg-white/90"
                }`}
              >
                <div className="h-28 w-full bg-zinc-900/70">
                  {hasLive(card.stream) ? (
                    <MediaSurface stream={card.stream} muted className="h-full w-full object-cover" />
                  ) : (
                    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.22),transparent_55%),rgba(12,18,16,0.94)] text-zinc-300">
                      <div
                        aria-hidden
                        className="pointer-events-none absolute inset-0"
                      >
                        <div className="absolute left-1/2 top-1/2 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-400/30 blur-2xl" />
                        <div className="absolute left-[38%] top-[42%] h-16 w-16 rounded-full bg-lime-300/18 blur-xl" />
                        <div className="absolute right-[32%] bottom-[28%] h-14 w-14 rounded-full bg-green-500/16 blur-xl" />
                      </div>
                      {card.isScreen ? (
                        <MonitorUp size={18} />
                      ) : (
                        <div className="relative h-16 w-16 overflow-hidden rounded-full ring-2 ring-white/10 shadow-[0_0_30px_rgba(16,185,129,0.18)]">
                          {!card.isLocal && peerAvatarUrl ? (
                            <Image
                              src={peerAvatarUrl}
                              alt=""
                              fill
                              sizes="64px"
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-500 to-emerald-800 text-sm font-semibold text-white">
                              {initials(card.isLocal ? "Você" : peerName)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="truncate">{card.label}</span>
                  <span className="inline-flex items-center gap-1">
                    {card.remoteMicMuted ? (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-300">
                        <span className="inline-flex items-center gap-1">
                          <MicOff size={10} /> mute
                        </span>
                      </span>
                    ) : null}
                    {card.isScreen ? (
                      <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                        ao vivo
                      </span>
                    ) : null}
                    {pinApplies && pinnedTarget === card.id ? (
                      <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-300">
                        fixado
                      </span>
                    ) : null}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </aside>
      ) : null}
    </div>
  );
}
