"use client";

import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { hasLiveRemoteOrLocalScreenCapture } from "@/lib/call-video-layout";
import { applyPreferredSinkToAudioElement } from "@/lib/call-audio-output-preference";
import { DirectVoiceCallSession, isScreenCaptureTrack } from "@/lib/direct-voice-call-audio";
import { MediasoupDirectCallSession } from "@/lib/mediasoup-direct-call-session";
import { playRemoteMediaStreamWebAudio } from "@/lib/play-remote-media-stream-web-audio";
import {
  type MediasoupClosedProducerPayload,
  emitVoiceCallVoiceActivity,
  type MediasoupNewProducerPayload,
  type VoiceCallWebRtcSignal,
  type VoiceCallWebRtcSignalPayload,
} from "@/lib/session-socket";
import { useVoiceActivityFromStream } from "@/hooks/use-voice-activity-from-stream";

/** Mediasoup (SFU) por defeito; forçar WebRTC P2P com NEXT_PUBLIC_MEDIASOUP_ENABLED=false. */
const USE_MEDIASOUP =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_MEDIASOUP_ENABLED !== "false";

/** Tauri v2 pode expor `isTauri` ou só `__TAURI_INTERNALS__` consoante a build. */
function shouldUseWebAudioForRemoteStream(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (isTauri()) return true;
  } catch {
    /* ignore */
  }
  return "__TAURI_INTERNALS__" in window;
}

/** WebKit (Tauri): `play()` após negociação WebRTC pode falhar até haver gesto ou novo frame. */
function playRemoteCallAudio(el: HTMLAudioElement): void {
  const tryPlay = () => {
    void el.play().catch(() => {});
  };
  tryPlay();
  el.addEventListener("canplay", tryPlay, { once: true });
  el.addEventListener("loadedmetadata", tryPlay, { once: true });
  requestAnimationFrame(() => {
    requestAnimationFrame(tryPlay);
  });
  const unlock = () => {
    tryPlay();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
}

function attachRemoteCameraTrackListeners(
  vt: MediaStreamTrack,
  stream: MediaStream,
  setRemoteCameraStream: (s: MediaStream | null) => void,
  cleanupRef: MutableRefObject<(() => void) | null>,
): void {
  cleanupRef.current?.();
  cleanupRef.current = null;
  const onEnded = () => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    setRemoteCameraStream(null);
  };
  /** Não usar `mute`/`unmute` do track remoto: em WebRTC costumam ficar muted até o primeiro frame. */
  vt.addEventListener("ended", onEnded);
  cleanupRef.current = () => {
    vt.removeEventListener("ended", onEnded);
  };
}

export function useDirectVoiceCallAudio({
  conversationId,
  callRole,
  enabled,
  micMuted,
  micDeviceEpoch,
  callCameraOff,
  cameraDeviceEpoch,
  peerRemoteCameraOff,
}: {
  conversationId: string | null;
  callRole: "caller" | "callee" | null;
  enabled: boolean;
  micMuted: boolean;
  micDeviceEpoch: number;
  callCameraOff: boolean;
  cameraDeviceEpoch: number;
  peerRemoteCameraOff: boolean;
}) {
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  /** Palco principal: ecrã partilhado (local/remoto) ou câmera remota. */
  const mainStageVideoRef = useRef<HTMLVideoElement | null>(null);
  /** Bolinha top-right: câmera de quem partilha o ecrã (local ou remoto). */
  const pipTopVideoRef = useRef<HTMLVideoElement | null>(null);
  /** Canto inferior direito: a outra pessoa em modo partilha; no modo normal = preview da tua câmera. */
  const pipBottomVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteWebAudioCleanupRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<DirectVoiceCallSession | MediasoupDirectCallSession | null>(null);
  const preStartSignalsRef = useRef<VoiceCallWebRtcSignal[]>([]);
  const remoteCameraTrackCleanupRef = useRef<(() => void) | null>(null);
  const prevIShareRef = useRef(false);
  const prevTheyShareRef = useRef(false);
  const micMutedRef = useRef(micMuted);
  const callCameraOffRef = useRef(callCameraOff);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteCameraStream, setRemoteCameraStream] = useState<MediaStream | null>(null);
  const [remoteScreenStream, setRemoteScreenStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [mainStageSelection, setMainStageSelection] = useState<string | null>(null);
  const [mainStagePinnedTarget, setMainStagePinnedTarget] = useState<string | null>(null);

  const localSpeaking = useVoiceActivityFromStream(
    enabled && conversationId && !micMuted ? localStream : null,
  );

  useEffect(() => {
    if (!enabled || !conversationId) return;
    emitVoiceCallVoiceActivity({ conversationId, speaking: localSpeaking });
  }, [enabled, conversationId, localSpeaking]);

  useEffect(() => {
    if (!enabled || !conversationId) return;
    return () => {
      emitVoiceCallVoiceActivity({ conversationId, speaking: false });
    };
  }, [enabled, conversationId]);

  useEffect(() => {
    micMutedRef.current = micMuted;
  }, [micMuted]);

  useEffect(() => {
    callCameraOffRef.current = callCameraOff;
  }, [callCameraOff]);

  const iShareScreen = hasLiveRemoteOrLocalScreenCapture(localScreenStream);
  const theyShareScreen = hasLiveRemoteOrLocalScreenCapture(remoteScreenStream);
  const anyScreenSharing = iShareScreen || theyShareScreen;
  const effectiveMainStageSelection = anyScreenSharing ? mainStageSelection : null;
  const effectiveMainStagePinnedTarget = anyScreenSharing ? mainStagePinnedTarget : null;

  useEffect(() => {
    const main = mainStageVideoRef.current;
    const top = pipTopVideoRef.current;
    const bottom = pipBottomVideoRef.current;

    const play = (el: HTMLVideoElement, stream: MediaStream | null) => {
      el.srcObject = stream;
      if (stream) void el.play().catch(() => {});
      else {
        el.pause();
      }
    };

    const prevI = prevIShareRef.current;
    const prevThey = prevTheyShareRef.current;
    const leavingLocalScreen = prevI && !iShareScreen;
    const leavingRemoteScreen = prevThey && !theyShareScreen;
    prevIShareRef.current = iShareScreen;
    prevTheyShareRef.current = theyShareScreen;

    /** Tracks remotos podem estar `muted` até chegar RTP; não usar `track.muted` como “câmera off”. */
    const remoteCamOk =
      !peerRemoteCameraOff &&
      remoteCameraStream != null &&
      remoteCameraStream.getVideoTracks().some(
        (t) => t.readyState === "live" && !isScreenCaptureTrack(t),
      );
    const localCamOk =
      localCameraStream != null &&
      localCameraStream.getVideoTracks().some((t) => t.readyState === "live");

    if (iShareScreen) {
      if (main) play(main, localScreenStream);
      if (top) play(top, null);
      if (bottom)
        play(
          bottom,
          localCamOk ? localCameraStream : remoteCamOk ? remoteCameraStream : null,
        );
      return;
    }
    if (theyShareScreen) {
      if (main) play(main, remoteScreenStream);
      if (top) play(top, remoteCamOk ? remoteCameraStream : null);
      if (bottom) play(bottom, localCamOk ? localCameraStream : null);
      return;
    }
    if (main && (leavingLocalScreen || leavingRemoteScreen)) {
      main.srcObject = null;
      main.pause();
    }
    if (main) play(main, remoteCamOk ? remoteCameraStream : null);
    if (top) play(top, null);
    if (bottom) play(bottom, localCamOk ? localCameraStream : null);
  }, [
    iShareScreen,
    theyShareScreen,
    localScreenStream,
    remoteScreenStream,
    localCameraStream,
    remoteCameraStream,
    peerRemoteCameraOff,
  ]);

  useEffect(() => {
    if (!enabled || !conversationId) {
      return;
    }
    if (!USE_MEDIASOUP && !callRole) {
      return;
    }
    const sess = USE_MEDIASOUP
      ? new MediasoupDirectCallSession(conversationId)
      : new DirectVoiceCallSession(conversationId, callRole!);
    sessionRef.current = sess;
    sess.setOnLocalStreamChange((s) => setLocalStream(s));
    sess.setOnLocalVideoStreamChange((s) => setLocalCameraStream(s));
    sess.setOnLocalScreenStreamChange((s) => setLocalScreenStream(s));
    sess.setOnRemoteAudioStream((stream) => {
      remoteWebAudioCleanupRef.current?.();
      remoteWebAudioCleanupRef.current = null;

      if (shouldUseWebAudioForRemoteStream()) {
        remoteWebAudioCleanupRef.current = playRemoteMediaStreamWebAudio(stream);
        const el = remoteAudioRef.current;
        if (el) {
          el.pause();
          el.srcObject = null;
        }
        return;
      }

      let frames = 0;
      const attachToElement = () => {
        const el = remoteAudioRef.current;
        if (el) {
          el.srcObject = stream;
          el.muted = false;
          el.volume = 1;
          void applyPreferredSinkToAudioElement(el);
          playRemoteCallAudio(el);
          return;
        }
        frames += 1;
        if (frames < 90) {
          requestAnimationFrame(attachToElement);
        }
      };
      attachToElement();
    });
    sess.setOnRemoteCameraStream((stream) => {
      if (!stream) {
        remoteCameraTrackCleanupRef.current?.();
        remoteCameraTrackCleanupRef.current = null;
        setRemoteCameraStream(null);
        return;
      }
      const vt = stream.getVideoTracks()[0];
      if (!vt) {
        remoteCameraTrackCleanupRef.current?.();
        remoteCameraTrackCleanupRef.current = null;
        setRemoteCameraStream(null);
        return;
      }
      attachRemoteCameraTrackListeners(vt, stream, setRemoteCameraStream, remoteCameraTrackCleanupRef);
      setRemoteCameraStream(stream);
    });
    sess.setOnRemoteScreenStream((stream) => {
      setRemoteScreenStream(stream);
    });
    if (!USE_MEDIASOUP) {
      for (const sig of preStartSignalsRef.current.splice(0)) {
        void sess.handleRemote(sig);
      }
    }
    void (async () => {
      await sess.start(micMutedRef.current);
      await sess.setCameraEnabled(!callCameraOffRef.current);
    })();
    const remoteAudioElement = remoteAudioRef.current;
    return () => {
      remoteCameraTrackCleanupRef.current?.();
      remoteCameraTrackCleanupRef.current = null;
      remoteWebAudioCleanupRef.current?.();
      remoteWebAudioCleanupRef.current = null;
      sess.destroy();
      sessionRef.current = null;
      setLocalStream(null);
      setRemoteCameraStream(null);
      setRemoteScreenStream(null);
      setLocalCameraStream(null);
      setLocalScreenStream(null);
      if (remoteAudioElement) {
        remoteAudioElement.pause();
        remoteAudioElement.srcObject = null;
      }
      for (const r of [mainStageVideoRef, pipTopVideoRef, pipBottomVideoRef]) {
        const v = r.current;
        if (v) {
          v.pause();
          v.srcObject = null;
        }
      }
      setMainStageSelection(null);
      setMainStagePinnedTarget(null);
    };
  }, [enabled, conversationId, callRole]);

  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    void s.setMicMuted(micMuted);
  }, [micMuted]);

  useEffect(() => {
    const s = sessionRef.current;
    if (!s) return;
    void s.setCameraEnabled(!callCameraOff);
  }, [callCameraOff]);

  useEffect(() => {
    if (!enabled || micDeviceEpoch === 0) return;
    const s = sessionRef.current;
    if (!s) return;
    void s.refreshMicrophoneFromPreference();
  }, [micDeviceEpoch, enabled]);

  useEffect(() => {
    if (!enabled || cameraDeviceEpoch === 0) return;
    const s = sessionRef.current;
    if (!s) return;
    void s.refreshCameraFromPreference();
  }, [cameraDeviceEpoch, enabled]);

  const toggleScreenShare = useCallback(async () => {
    const s = sessionRef.current;
    if (!s) return;
    await s.setScreenSharingEnabled(!s.isScreenSharing());
  }, []);

  const onWebRtcSignal = useCallback(
    (p: VoiceCallWebRtcSignalPayload) => {
      if (USE_MEDIASOUP || p.conversationId !== conversationId) return;
      const sig = p.signal as VoiceCallWebRtcSignal;
      const s = sessionRef.current;
      if (s) void s.handleRemote(sig);
      else preStartSignalsRef.current.push(sig);
    },
    [conversationId],
  );

  const onMediasoupNewProducer = useCallback(
    (p: MediasoupNewProducerPayload) => {
      if (!USE_MEDIASOUP || p.conversationId !== conversationId) return;
      const s = sessionRef.current;
      if (s instanceof MediasoupDirectCallSession) void s.ingestRemoteProducer(p);
    },
    [conversationId],
  );

  const onMediasoupProducerClosed = useCallback(
    (p: MediasoupClosedProducerPayload) => {
      if (!USE_MEDIASOUP || p.conversationId !== conversationId) return;
      const s = sessionRef.current;
      if (s instanceof MediasoupDirectCallSession) {
        s.handleRemoteProducerClosed(p);
      }
    },
    [conversationId],
  );

  return {
    remoteAudioRef,
    mainStageVideoRef,
    pipTopVideoRef,
    pipBottomVideoRef,
    remoteCameraStream,
    remoteScreenStream,
    localCameraStream,
    localScreenStream,
    mainStageSelection: effectiveMainStageSelection,
    setMainStageSelection,
    mainStagePinnedTarget: effectiveMainStagePinnedTarget,
    setMainStagePinnedTarget,
    screenSharingLocal: iShareScreen,
    toggleScreenShare,
    onWebRtcSignal,
    onMediasoupNewProducer,
    onMediasoupProducerClosed,
    localVoiceStream: localStream,
  };
}
