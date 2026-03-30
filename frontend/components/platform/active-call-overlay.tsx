"use client";

import { MessageSquare, MicOff, MonitorUp, PhoneOff, UserPlus } from "lucide-react";
import Image from "next/image";
import type { RefObject } from "react";
import { CallCameraControl } from "@/components/platform/call-camera-control";
import { CallMicControl } from "@/components/platform/call-mic-control";
import { GroupAudioRoomLayout } from "@/components/platform/group-audio-room-layout";
import { DirectCallLiveLayout } from "@/components/platform/video-call-layout/direct-call-live-layout";
import type { CallRoomParticipant } from "@/lib/call-events";
import { useCallback, useEffect, useState } from "react";
import type { GroupParticipantMediaState } from "@/hooks/use-group-call-media";

/** @deprecated use CallRoomParticipant from @/lib/call-events */
export type GroupRoomParticipant = CallRoomParticipant;

/** Adicionar e Chat: só ícone, mesmo tamanho no overlay e na barra minimizada. */
const CALL_HEADER_ACTION_BASE =
  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition";

type ActiveCallOverlayProps = {
  isDark: boolean;
  peerName: string;
  /** Foto do contacto na chamada 1:1; sem foto usam-se as iniciais. */
  peerAvatarUrl?: string | null;
  /** p2p = 1:1 com avatar; conference = lista na sala. */
  roomLayout: "p2p" | "conference";
  roomParticipants: CallRoomParticipant[];
  onEndCall: () => void;
  /** Chamada directa com WebRTC: mute controlado (microfone real). */
  micMuted?: boolean;
  onMicMutedChange?: (muted: boolean) => void;
  /** O outro participante está a falar (VAD recebido por socket) — efeito na foto dele. */
  peerRemoteSpeaking?: boolean;
  /** O outro participante mutou o microfone (socket). */
  peerRemoteMicMuted?: boolean;
  /** O outro participante desligou a câmera (socket). */
  peerRemoteCameraOff?: boolean;
  remoteAudioRef?: RefObject<HTMLAudioElement | null>;
  onMicDeviceChange?: () => void;
  /** Chamada directa WebRTC: vídeo remoto + preview local; câmera controlada pelo parent (`camOff` / `onCamOffChange`). */
  directCallVideo?: boolean;
  camOff?: boolean;
  onCamOffChange?: (camOff: boolean) => void;
  /** Palco principal, bolinha top-right (câmera de quem partilha ecrã), canto inferior (outra pessoa em modo partilha). */
  mainStageVideoRef?: RefObject<HTMLVideoElement | null>;
  pipTopVideoRef?: RefObject<HTMLVideoElement | null>;
  pipBottomVideoRef?: RefObject<HTMLVideoElement | null>;
  remoteCameraStream?: MediaStream | null;
  remoteScreenStream?: MediaStream | null;
  localCameraStream?: MediaStream | null;
  localScreenStream?: MediaStream | null;
  participantMediaById?: Record<string, GroupParticipantMediaState>;
  participantSpeakingById?: Record<string, boolean>;
  participantMicMutedById?: Record<string, boolean>;
  participantCameraOffById?: Record<string, boolean>;
  mainStageSelection?: string | null;
  onMainStageSelectionChange?: (target: string | null) => void;
  mainStagePinnedTarget?: string | null;
  onMainStagePinnedChange?: (target: string | null) => void;
  /** Partilha de ecrã activa (WebRTC). */
  screenSharing?: boolean;
  onScreenShareToggle?: () => void | Promise<void>;
  onCameraDeviceChange?: () => void;
};

export function ActiveCallOverlay({
  isDark,
  peerName,
  peerAvatarUrl = null,
  roomLayout,
  roomParticipants,
  onEndCall,
  micMuted: micMutedProp,
  onMicMutedChange,
  peerRemoteSpeaking = false,
  peerRemoteMicMuted = false,
  peerRemoteCameraOff = false,
  remoteAudioRef,
  onMicDeviceChange,
  directCallVideo = false,
  camOff: camOffProp,
  onCamOffChange,
  mainStageVideoRef: _mainStageVideoRef,
  pipTopVideoRef: _pipTopVideoRef,
  pipBottomVideoRef: _pipBottomVideoRef,
  remoteCameraStream = null,
  remoteScreenStream = null,
  localCameraStream = null,
  localScreenStream = null,
  participantMediaById,
  participantSpeakingById,
  participantMicMutedById,
  participantCameraOffById,
  mainStageSelection,
  onMainStageSelectionChange,
  mainStagePinnedTarget,
  onMainStagePinnedChange,
  screenSharing: screenSharingProp,
  onScreenShareToggle,
  onCameraDeviceChange,
}: ActiveCallOverlayProps) {
  const [internalMicMuted, setInternalMicMuted] = useState(false);
  const micMuted = micMutedProp !== undefined ? micMutedProp : internalMicMuted;
  const toggleMicMuted = () => {
    const next = !micMuted;
    if (onMicMutedChange) onMicMutedChange(next);
    else setInternalMicMuted(next);
  };
  const [internalCamOff, setInternalCamOff] = useState(false);
  const mediaControlsEnabled =
    directCallVideo || onCamOffChange !== undefined || onScreenShareToggle !== undefined;
  const camOff = mediaControlsEnabled ? (camOffProp ?? true) : internalCamOff;
  const [internalScreenSharing, setInternalScreenSharing] = useState(false);
  const screenSharing =
    mediaControlsEnabled && onScreenShareToggle !== undefined
      ? (screenSharingProp ?? false)
      : internalScreenSharing;
  const isConferenceLayout = roomLayout === "conference";

  const initials = useCallback((name: string) => {
    const p = name.trim().split(/\s+/).filter(Boolean);
    if (p.length === 0) return "?";
    if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
    return `${p[0]![0] ?? ""}${p[p.length - 1]![0] ?? ""}`.toUpperCase();
  }, []);

  const shell = isDark
    ? "bg-zinc-950 text-zinc-100"
    : "bg-zinc-100 text-zinc-900";

  const ctrlIdle = isDark
    ? "bg-zinc-800/95 text-zinc-100 hover:bg-zinc-700"
    : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50";

  const ctrlActive = isDark
    ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40"
    : "bg-amber-100 text-amber-900 ring-1 ring-amber-300/80";

  const ctrlScreenOn = isDark
    ? "bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-400/40"
    : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/80";

  const inRoomCount = roomParticipants.length;
  void inRoomCount;

  void _mainStageVideoRef;
  void _pipTopVideoRef;
  void _pipBottomVideoRef;

  return (
    <div
      className={`absolute inset-0 z-[210] flex min-h-0 flex-1 flex-col overflow-hidden ${shell}`}
      role="dialog"
      aria-modal="true"
      aria-label={isConferenceLayout ? "Sala de audio em grupo" : "Chamada em andamento"}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className={`relative flex min-h-[200px] flex-1 flex-col overflow-hidden ${
            isDark
              ? "bg-gradient-to-b from-zinc-900 to-zinc-950"
              : "bg-gradient-to-b from-slate-200/80 to-slate-100"
          }`}
        >
          {isConferenceLayout && roomParticipants.length > 0 ? (
            <GroupAudioRoomLayout
              isDark={isDark}
              roomParticipants={roomParticipants}
              participantMediaById={participantMediaById}
              participantSpeakingById={participantSpeakingById}
              participantMicMutedById={participantMicMutedById}
              participantCameraOffById={participantCameraOffById}
            />
          ) : directCallVideo ? (
            <DirectCallLiveLayout
              isDark={isDark}
              peerName={peerName}
              peerAvatarUrl={peerAvatarUrl}
              peerRemoteSpeaking={peerRemoteSpeaking}
              peerRemoteMicMuted={peerRemoteMicMuted}
              peerRemoteCameraOff={peerRemoteCameraOff}
              remoteCameraStream={remoteCameraStream}
              remoteScreenStream={remoteScreenStream}
              localCameraStream={localCameraStream}
              localScreenStream={localScreenStream}
              activeMain={mainStageSelection ?? undefined}
              onActiveMainChange={onMainStageSelectionChange}
              pinnedMain={mainStagePinnedTarget ?? undefined}
              onPinnedMainChange={onMainStagePinnedChange}
            />
          ) : (
            <div className="relative flex min-h-[200px] flex-1 flex-col items-center justify-center px-4">
              <div className="relative flex h-48 w-48 shrink-0 items-center justify-center">
                <div
                  className={`pointer-events-none absolute -inset-3 rounded-full bg-gradient-to-br from-emerald-400/40 via-cyan-400/25 to-teal-500/35 blur-xl transition-opacity duration-300 ease-out ${
                    peerRemoteSpeaking ? "opacity-100" : "opacity-0"
                  }`}
                  aria-hidden
                />
                <div
                  className={`pointer-events-none absolute inset-0 rounded-full transition-all duration-300 ease-out ${
                    peerRemoteSpeaking
                      ? "scale-100 opacity-100 shadow-[0_0_40px_rgba(45,212,191,0.5)] ring-[2px] ring-emerald-400/80 ring-offset-2 ring-offset-transparent"
                      : "scale-[0.94] opacity-0 ring-0 shadow-none"
                  }`}
                  aria-hidden
                />
                <div className="relative h-40 w-40 shrink-0">
                  <div
                    className={`relative flex h-40 w-40 overflow-hidden rounded-full shadow-2xl ring-4 ${
                      isDark ? "ring-emerald-500/20" : "ring-emerald-300/40"
                    }`}
                  >
                    {peerAvatarUrl ? (
                      <Image
                        src={peerAvatarUrl}
                        alt=""
                        fill
                        sizes="160px"
                        className="object-cover"
                      />
                    ) : (
                      <div
                        className={`flex h-full w-full items-center justify-center bg-gradient-to-br text-4xl font-bold text-white ${
                          isDark
                            ? "from-emerald-700 to-emerald-950"
                            : "from-emerald-500 to-emerald-700"
                        }`}
                      >
                        {initials(peerName)}
                      </div>
                    )}
                  </div>
                  {peerRemoteMicMuted ? (
                    <div
                      className={`pointer-events-none absolute right-1 bottom-1 z-10 flex h-7 w-7 items-center justify-center rounded-full shadow-md ring-1 ${
                        isDark
                          ? "bg-zinc-900/95 text-amber-400 ring-amber-500/50"
                          : "bg-white text-amber-700 ring-amber-400/60"
                      }`}
                      title="Microfone desligado"
                      aria-label="O contacto desligou o microfone"
                    >
                      <MicOff size={13} strokeWidth={2.2} />
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className={`flex shrink-0 flex-wrap items-center justify-center gap-3 border-t px-4 py-4 ${
            isDark ? "border-zinc-800 bg-zinc-900/95" : "border-zinc-200 bg-white/95"
          }`}
        >
          <CallMicControl
            isDark={isDark}
            micMuted={micMuted}
            onToggleMute={toggleMicMuted}
            ctrlIdle={ctrlIdle}
            ctrlActive={ctrlActive}
            size="lg"
            remoteAudioRef={remoteAudioRef}
            onMicDeviceChange={onMicDeviceChange}
          />
          <CallCameraControl
            isDark={isDark}
            camOff={camOff}
            onToggleCamera={() => {
              if (mediaControlsEnabled && onCamOffChange) onCamOffChange(!camOff);
              else setInternalCamOff((v) => !v);
            }}
            ctrlIdle={ctrlIdle}
            ctrlActive={ctrlActive}
            size="lg"
            onCameraDeviceChange={onCameraDeviceChange}
          />
          <button
            type="button"
            aria-label={screenSharing ? "Parar compartilhamento" : "Compartilhar tela"}
            aria-pressed={screenSharing}
            onClick={() => {
              if (mediaControlsEnabled && onScreenShareToggle) void onScreenShareToggle();
              else setInternalScreenSharing((v) => !v);
            }}
            className={`flex h-12 w-12 items-center justify-center rounded-full transition ${
              screenSharing ? ctrlScreenOn : ctrlIdle
            }`}
          >
            <MonitorUp size={20} />
          </button>
          <button
            type="button"
            aria-label={isConferenceLayout ? "Sair da sala de audio" : "Encerrar ligacao"}
            onClick={onEndCall}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-700 text-white shadow-md shadow-red-900/30 transition hover:from-red-400 hover:to-red-600"
          >
            <PhoneOff size={20} strokeWidth={2.2} />
          </button>
        </div>
      </div>
    </div>
  );
}

type ActiveCallMinimizedBarProps = {
  isDark: boolean;
  peerName: string;
  roomLayout: "p2p" | "conference";
  roomParticipants: CallRoomParticipant[];
  onAddPeople: () => void;
  /** Restaura a tela cheia da ligação. */
  onExpandCall: () => void;
  onEndCall: () => void;
  micMuted?: boolean;
  onMicMutedChange?: (muted: boolean) => void;
  peerRemoteMicMuted?: boolean;
  remoteAudioRef?: RefObject<HTMLAudioElement | null>;
  onMicDeviceChange?: () => void;
  directCallVideo?: boolean;
  camOff?: boolean;
  onCamOffChange?: (camOff: boolean) => void;
  screenSharing?: boolean;
  onScreenShareToggle?: () => void | Promise<void>;
  onCameraDeviceChange?: () => void;
};

/** Faixa compacta com cabeçalho e controles da ligação enquanto a thread fica visível. */
export function ActiveCallMinimizedBar({
  isDark,
  peerName,
  roomLayout,
  roomParticipants,
  onAddPeople,
  onExpandCall,
  onEndCall,
  micMuted: micMutedProp,
  onMicMutedChange,
  peerRemoteMicMuted = false,
  remoteAudioRef,
  onMicDeviceChange,
  directCallVideo = false,
  camOff: camOffProp,
  onCamOffChange,
  screenSharing: screenSharingPropMin,
  onScreenShareToggle,
  onCameraDeviceChange,
}: ActiveCallMinimizedBarProps) {
  const [internalMicMuted, setInternalMicMuted] = useState(false);
  const micMuted = micMutedProp !== undefined ? micMutedProp : internalMicMuted;
  const toggleMicMuted = () => {
    const next = !micMuted;
    if (onMicMutedChange) onMicMutedChange(next);
    else setInternalMicMuted(next);
  };
  const [internalCamOff, setInternalCamOff] = useState(false);
  const mediaControlsEnabled =
    directCallVideo || onCamOffChange !== undefined || onScreenShareToggle !== undefined;
  const camOff = mediaControlsEnabled ? (camOffProp ?? true) : internalCamOff;
  const [internalScreenSharingMin, setInternalScreenSharingMin] = useState(false);
  const screenSharing =
    mediaControlsEnabled && onScreenShareToggle !== undefined
      ? (screenSharingPropMin ?? false)
      : internalScreenSharingMin;
  const isConferenceLayout = roomLayout === "conference";
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setElapsedSec((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  const shell = isDark
    ? "border-zinc-800 bg-zinc-950 text-zinc-100"
    : "border-zinc-200 bg-zinc-50 text-zinc-900";

  const ctrlIdle = isDark
    ? "bg-zinc-800/95 text-zinc-100 hover:bg-zinc-700"
    : "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50";

  const ctrlActive = isDark
    ? "bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/40"
    : "bg-amber-100 text-amber-900 ring-1 ring-amber-300/80";

  const ctrlScreenOn = isDark
    ? "bg-emerald-600/30 text-emerald-200 ring-1 ring-emerald-400/40"
    : "bg-emerald-100 text-emerald-900 ring-1 ring-emerald-300/80";

  const inRoomCount = roomParticipants.length;
  const showMinimizedHeader = !mediaControlsEnabled;
  const showAddPeople = !mediaControlsEnabled && !isConferenceLayout;

  return (
    <div
      className={`relative z-[205] flex shrink-0 flex-col border-b shadow-sm ${shell}`}
      role="region"
      aria-label={isConferenceLayout ? "Sala de audio (minimizada)" : "Chamada ativa (minimizada)"}
    >
      {showMinimizedHeader ? (
        <header
          className={`flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5 ${
            isDark ? "border-zinc-800 bg-zinc-900/90" : "border-zinc-200 bg-white/90"
          }`}
        >
          <div className="min-w-0 flex-1">
            <p
              className={`text-[10px] font-bold tracking-widest uppercase ${
                isDark ? "text-emerald-400" : "text-emerald-700"
              }`}
            >
              {isConferenceLayout ? "Sala de audio" : "Chamada ativa"}
            </p>
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="min-w-0 truncate text-sm font-semibold">{peerName}</p>
              {peerRemoteMicMuted ? (
                <MicOff
                  size={13}
                  strokeWidth={2.2}
                  className={isDark ? "shrink-0 text-amber-400/90" : "shrink-0 text-amber-600"}
                  aria-label="O contacto desligou o microfone"
                />
              ) : null}
            </div>
            <p className={`text-xs tabular-nums ${isDark ? "text-zinc-500" : "text-zinc-600"}`}>
              {isConferenceLayout
                ? `${inRoomCount} ${inRoomCount === 1 ? "pessoa na sala" : "pessoas na sala"} · ${mm}:${ss}`
                : `${mm}:${ss}`}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {showAddPeople ? (
              <button
                type="button"
                aria-label="Adicionar pessoas na chamada"
                onClick={onAddPeople}
                className={`${CALL_HEADER_ACTION_BASE} ${
                  isDark
                    ? "border border-zinc-600 bg-zinc-800 text-zinc-100 hover:bg-zinc-700"
                    : "border border-slate-300 bg-white text-slate-800 shadow-sm hover:bg-slate-50"
                }`}
              >
                <UserPlus size={18} aria-hidden />
              </button>
            ) : null}
            <button
              type="button"
              aria-label="Voltar à chamada em tela cheia"
              aria-pressed
              onClick={onExpandCall}
              className={`${CALL_HEADER_ACTION_BASE} ${
                isDark
                  ? "bg-emerald-700 text-white ring-2 ring-emerald-500/50"
                  : "bg-emerald-600 text-white ring-2 ring-emerald-400/60"
              }`}
            >
              <MessageSquare size={18} aria-hidden />
            </button>
          </div>
        </header>
      ) : null}
      <div
        className={`flex shrink-0 flex-wrap items-center justify-center gap-2 px-3 py-2.5 ${
          isDark ? "bg-zinc-900/95" : "bg-white/95"
        }`}
      >
        <CallMicControl
          isDark={isDark}
          micMuted={micMuted}
          onToggleMute={toggleMicMuted}
          ctrlIdle={ctrlIdle}
          ctrlActive={ctrlActive}
          size="sm"
          remoteAudioRef={remoteAudioRef}
          onMicDeviceChange={onMicDeviceChange}
        />
        <CallCameraControl
          isDark={isDark}
          camOff={camOff}
            onToggleCamera={() => {
              if (mediaControlsEnabled && onCamOffChange) onCamOffChange(!camOff);
              else setInternalCamOff((v) => !v);
            }}
          ctrlIdle={ctrlIdle}
          ctrlActive={ctrlActive}
          size="sm"
          onCameraDeviceChange={onCameraDeviceChange}
        />
        <button
          type="button"
          aria-label={screenSharing ? "Parar compartilhamento" : "Compartilhar tela"}
            aria-pressed={screenSharing}
            onClick={() => {
              if (mediaControlsEnabled && onScreenShareToggle) void onScreenShareToggle();
              else setInternalScreenSharingMin((v) => !v);
            }}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition ${
            screenSharing ? ctrlScreenOn : ctrlIdle
          }`}
        >
          <MonitorUp size={18} />
        </button>
        <button
          type="button"
          aria-label={isConferenceLayout ? "Sair da sala de audio" : "Encerrar ligacao"}
          onClick={onEndCall}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-red-500 to-red-700 text-white shadow-md shadow-red-900/30 transition hover:from-red-400 hover:to-red-600"
        >
          <PhoneOff size={18} strokeWidth={2.2} />
        </button>
      </div>
    </div>
  );
}
