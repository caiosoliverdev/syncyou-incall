"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { isStageTargetValid, resolveMainStage } from "./resolve-main-stage";
import {
  type CallState,
  type Participant,
  stageForScreen,
  type StageTarget,
} from "./types";

type CallStateContextValue = {
  state: CallState;
  setActiveMain: (target: StageTarget) => void;
  setParticipantCameraOn: (participantId: string, cameraOn: boolean) => void;
  setParticipantScreenSharing: (participantId: string, sharing: boolean) => void;
  setParticipantCameraStream: (
    participantId: string,
    stream: MediaStream | null,
  ) => void;
  setParticipantScreenStream: (
    participantId: string,
    stream: MediaStream | null,
  ) => void;
  toggleLocalCamera: () => Promise<void>;
  startLocalScreenShare: () => Promise<void>;
  stopLocalScreenShare: () => void;
};

const CallStateContext = createContext<CallStateContextValue | null>(null);

const LOCAL_ID = "local-user";
const REMOTE_ID = "remote-user";

const initialParticipants: Participant[] = [
  {
    id: LOCAL_ID,
    name: "Você",
    isLocal: true,
    cameraOn: false,
    screenSharing: false,
    cameraStream: null,
    screenStream: null,
  },
  {
    id: REMOTE_ID,
    name: "Convidado",
    isLocal: false,
    cameraOn: true,
    screenSharing: false,
    cameraStream: null,
    screenStream: null,
  },
];

export function CallStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<CallState>(() => {
    const initialState: CallState = {
      participants: initialParticipants,
      activeMain: REMOTE_ID,
      screenShareOwnerId: undefined,
    };
    return {
      ...initialState,
      activeMain: resolveMainStage(initialState),
    };
  });
  const cameraTrackEndCleanupRef = useRef<(() => void) | null>(null);
  const screenTrackEndCleanupRef = useRef<(() => void) | null>(null);

  const setActiveMain = useCallback((target: StageTarget) => {
    setState((prev) => {
      const next = { ...prev, activeMain: target };
      if (!isStageTargetValid(next, target)) {
        return { ...next, activeMain: resolveMainStage(next) };
      }
      return next;
    });
  }, []);

  const patchParticipant = useCallback(
    (participantId: string, patch: Partial<Participant>) => {
      setState((prev) => {
        const participants = prev.participants.map((participant) =>
          participant.id === participantId ? { ...participant, ...patch } : participant,
        );
        const screenShareOwnerId = participants.find((participant) => participant.screenSharing)
          ?.id;
        const next: CallState = {
          ...prev,
          participants,
          screenShareOwnerId,
        };
        const activeMain = isStageTargetValid(next, next.activeMain)
          ? next.activeMain
          : resolveMainStage(next);
        return { ...next, activeMain };
      });
    },
    [],
  );

  const setParticipantCameraOn = useCallback(
    (participantId: string, cameraOn: boolean) => {
      patchParticipant(participantId, { cameraOn });
    },
    [patchParticipant],
  );

  const setParticipantScreenSharing = useCallback(
    (participantId: string, screenSharing: boolean) => {
      patchParticipant(participantId, { screenSharing });
      if (screenSharing) {
        setActiveMain(stageForScreen(participantId));
      }
    },
    [patchParticipant, setActiveMain],
  );

  const setParticipantCameraStream = useCallback(
    (participantId: string, stream: MediaStream | null) => {
      patchParticipant(participantId, {
        cameraStream: stream,
        stream: stream ?? undefined,
      });
    },
    [patchParticipant],
  );

  const setParticipantScreenStream = useCallback(
    (participantId: string, stream: MediaStream | null) => {
      patchParticipant(participantId, { screenStream: stream });
    },
    [patchParticipant],
  );

  const stopLocalScreenShare = useCallback(() => {
    setState((prev) => {
      const participants = prev.participants.map((participant) => {
        if (participant.id !== LOCAL_ID) return participant;
        participant.screenStream?.getTracks().forEach((track) => track.stop());
        return {
          ...participant,
          screenSharing: false,
          screenStream: null,
        };
      });
      const next: CallState = {
        ...prev,
        participants,
        screenShareOwnerId: participants.find((participant) => participant.screenSharing)?.id,
      };
      return {
        ...next,
        activeMain: resolveMainStage(next),
      };
    });
  }, []);

  const startLocalScreenShare = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getDisplayMedia) return;
    const local = state.participants.find((participant) => participant.id === LOCAL_ID);
    if (local?.screenStream) {
      setParticipantScreenSharing(LOCAL_ID, true);
      setActiveMain(stageForScreen(LOCAL_ID));
      return;
    }
    const display = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false,
    });
    const track = display.getVideoTracks()[0];
    if (track) {
      const onEnded = () => {
        stopLocalScreenShare();
      };
      track.addEventListener("ended", onEnded, { once: true });
      screenTrackEndCleanupRef.current = () => {
        track.removeEventListener("ended", onEnded);
      };
    }
    setParticipantScreenStream(LOCAL_ID, display);
    setParticipantScreenSharing(LOCAL_ID, true);
    setActiveMain(stageForScreen(LOCAL_ID));
  }, [
    setActiveMain,
    setParticipantScreenSharing,
    setParticipantScreenStream,
    state.participants,
    stopLocalScreenShare,
  ]);

  const toggleLocalCamera = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    const local = state.participants.find((participant) => participant.id === LOCAL_ID);
    if (!local) return;

    if (local.cameraStream) {
      const enabled = !local.cameraOn;
      local.cameraStream.getVideoTracks().forEach((track) => {
        track.enabled = enabled;
      });
      setParticipantCameraOn(LOCAL_ID, enabled);
      return;
    }

    const camera = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: false,
    });
    const track = camera.getVideoTracks()[0];
    if (track) {
      const onEnded = () => setParticipantCameraOn(LOCAL_ID, false);
      track.addEventListener("ended", onEnded, { once: true });
      cameraTrackEndCleanupRef.current = () => {
        track.removeEventListener("ended", onEnded);
      };
    }
    setParticipantCameraStream(LOCAL_ID, camera);
    setParticipantCameraOn(LOCAL_ID, true);
  }, [setParticipantCameraOn, setParticipantCameraStream, state.participants]);

  useEffect(() => {
    return () => {
      cameraTrackEndCleanupRef.current?.();
      screenTrackEndCleanupRef.current?.();
    };
  }, []);

  const value = useMemo<CallStateContextValue>(
    () => ({
      state,
      setActiveMain,
      setParticipantCameraOn,
      setParticipantScreenSharing,
      setParticipantCameraStream,
      setParticipantScreenStream,
      toggleLocalCamera,
      startLocalScreenShare,
      stopLocalScreenShare,
    }),
    [
      setActiveMain,
      setParticipantCameraOn,
      setParticipantCameraStream,
      setParticipantScreenSharing,
      setParticipantScreenStream,
      startLocalScreenShare,
      state,
      stopLocalScreenShare,
      toggleLocalCamera,
    ],
  );

  return <CallStateContext.Provider value={value}>{children}</CallStateContext.Provider>;
}

export function useCallState() {
  const ctx = useContext(CallStateContext);
  if (!ctx) {
    throw new Error("useCallState must be used within <CallStateProvider />");
  }
  return ctx;
}

export const CALL_DEMO_IDS = {
  localId: LOCAL_ID,
  remoteId: REMOTE_ID,
};
