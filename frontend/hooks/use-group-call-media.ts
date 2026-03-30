"use client";

import { isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { MediasoupGroupCallSession } from "@/lib/mediasoup-group-call-session";
import { playRemoteMediaStreamWebAudio } from "@/lib/play-remote-media-stream-web-audio";
import {
  emitVoiceCallVoiceActivity,
  type MediasoupClosedProducerPayload,
  type MediasoupNewProducerPayload,
} from "@/lib/session-socket";
import { useVoiceActivityFromStream } from "@/hooks/use-voice-activity-from-stream";

export type GroupParticipantMediaState = {
  cameraStream?: MediaStream | null;
  screenStream?: MediaStream | null;
};

function shouldUseWebAudioForRemoteStream(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (isTauri()) return true;
  } catch {
    /* ignore */
  }
  return "__TAURI_INTERNALS__" in window;
}

function playRemoteAudioElement(el: HTMLAudioElement): void {
  const tryPlay = () => {
    void el.play().catch(() => undefined);
  };
  tryPlay();
  el.addEventListener("canplay", tryPlay, { once: true });
  el.addEventListener("loadedmetadata", tryPlay, { once: true });
  requestAnimationFrame(() => {
    requestAnimationFrame(tryPlay);
  });
}

export function useGroupCallMedia({
  conversationId,
  enabled,
  micMuted,
  micDeviceEpoch,
  callCameraOff,
  cameraDeviceEpoch,
}: {
  conversationId: string | null;
  enabled: boolean;
  micMuted: boolean;
  micDeviceEpoch: number;
  callCameraOff: boolean;
  cameraDeviceEpoch: number;
}) {
  const sessionRef = useRef<MediasoupGroupCallSession | null>(null);
  const remoteAudioCleanupByProducerRef = useRef(new Map<string, () => void>());
  const localMicMutedRef = useRef(micMuted);
  const localCameraOffRef = useRef(callCameraOff);
  const [localVoiceStream, setLocalVoiceStream] = useState<MediaStream | null>(null);
  const [localCameraStream, setLocalCameraStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);
  const [participantMediaById, setParticipantMediaById] = useState<
    Record<string, GroupParticipantMediaState>
  >({});
  const localSpeaking = useVoiceActivityFromStream(
    enabled && conversationId && !micMuted ? localVoiceStream : null,
  );

  useEffect(() => {
    localMicMutedRef.current = micMuted;
  }, [micMuted]);

  useEffect(() => {
    localCameraOffRef.current = callCameraOff;
  }, [callCameraOff]);

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
    if (!enabled || !conversationId) return;
    const sess = new MediasoupGroupCallSession(conversationId);
    const remoteAudioCleanupByProducer = remoteAudioCleanupByProducerRef.current;
    sessionRef.current = sess;
    sess.setOnLocalStreamChange(setLocalVoiceStream);
    sess.setOnLocalVideoStreamChange(setLocalCameraStream);
    sess.setOnLocalScreenStreamChange(setLocalScreenStream);
    sess.setOnRemoteAudioStream(({ producerId, stream }) => {
      remoteAudioCleanupByProducer.get(producerId)?.();
      remoteAudioCleanupByProducer.delete(producerId);

      if (!stream) {
        return;
      }

      if (shouldUseWebAudioForRemoteStream()) {
        const cleanup = playRemoteMediaStreamWebAudio(stream);
        remoteAudioCleanupByProducer.set(producerId, cleanup);
        return;
      }

      const audio = new Audio();
      audio.autoplay = true;
      audio.srcObject = stream;
      audio.muted = false;
      audio.volume = 1;
      playRemoteAudioElement(audio);
      remoteAudioCleanupByProducer.set(producerId, () => {
        audio.pause();
        audio.srcObject = null;
      });
    });
    sess.setOnParticipantMediaChange((userId, source, stream) => {
      setParticipantMediaById((prev) => {
        const current = prev[userId] ?? {};
        const next = {
          ...current,
          [source === "screen" ? "screenStream" : "cameraStream"]: stream,
        };
        const hasCamera = Boolean(next.cameraStream);
        const hasScreen = Boolean(next.screenStream);
        if (!hasCamera && !hasScreen) {
          const copy = { ...prev };
          delete copy[userId];
          return copy;
        }
        return { ...prev, [userId]: next };
      });
    });

    void (async () => {
      await sess.start(localMicMutedRef.current);
      await sess.setCameraEnabled(!localCameraOffRef.current);
    })();

    return () => {
      for (const cleanup of remoteAudioCleanupByProducer.values()) {
        cleanup();
      }
      remoteAudioCleanupByProducer.clear();
      sess.destroy();
      sessionRef.current = null;
      setLocalVoiceStream(null);
      setLocalCameraStream(null);
      setLocalScreenStream(null);
      setParticipantMediaById({});
    };
  }, [enabled, conversationId]);

  useEffect(() => {
    const sess = sessionRef.current;
    if (!sess) return;
    void sess.setMicMuted(micMuted);
  }, [micMuted]);

  useEffect(() => {
    const sess = sessionRef.current;
    if (!sess) return;
    void sess.setCameraEnabled(!callCameraOff);
  }, [callCameraOff]);

  useEffect(() => {
    if (!enabled || micDeviceEpoch === 0) return;
    const sess = sessionRef.current;
    if (!sess) return;
    void sess.refreshMicrophoneFromPreference();
  }, [enabled, micDeviceEpoch]);

  useEffect(() => {
    if (!enabled || cameraDeviceEpoch === 0) return;
    const sess = sessionRef.current;
    if (!sess) return;
    void sess.refreshCameraFromPreference();
  }, [enabled, cameraDeviceEpoch]);

  const toggleScreenShare = useCallback(async () => {
    const sess = sessionRef.current;
    if (!sess) return;
    await sess.setScreenSharingEnabled(!sess.isScreenSharing());
  }, []);

  const onMediasoupNewProducer = useCallback(
    (payload: MediasoupNewProducerPayload) => {
      if (payload.conversationId !== conversationId) return;
      const sess = sessionRef.current;
      if (!sess) return;
      void sess.ingestRemoteProducer(payload);
    },
    [conversationId],
  );

  const onMediasoupProducerClosed = useCallback(
    (payload: MediasoupClosedProducerPayload) => {
      if (payload.conversationId !== conversationId) return;
      sessionRef.current?.handleRemoteProducerClosed(payload);
    },
    [conversationId],
  );

  return {
    localSpeaking,
    localVoiceStream,
    localCameraStream,
    localScreenStream,
    participantMediaById,
    screenSharingLocal: Boolean(localScreenStream),
    toggleScreenShare,
    onMediasoupNewProducer,
    onMediasoupProducerClosed,
  };
}
