"use client";

import { MonitorUp, MonitorX, Video, VideoOff } from "lucide-react";
import { useMemo } from "react";
import { CallStateProvider, useCallState, CALL_DEMO_IDS } from "./call-state-context";
import { VideoCallLayout } from "./video-call-layout";

function DemoControls() {
  const {
    state,
    toggleLocalCamera,
    startLocalScreenShare,
    stopLocalScreenShare,
    setParticipantCameraOn,
  } = useCallState();

  const local = useMemo(
    () => state.participants.find((participant) => participant.id === CALL_DEMO_IDS.localId),
    [state.participants],
  );
  const remote = useMemo(
    () => state.participants.find((participant) => participant.id === CALL_DEMO_IDS.remoteId),
    [state.participants],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void toggleLocalCamera()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-neutral-900 px-3 py-2 text-sm text-white transition hover:bg-neutral-800"
        >
          {local?.cameraOn ? <VideoOff size={16} /> : <Video size={16} />}
          {local?.cameraOn ? "Desligar câmera" : "Ligar câmera"}
        </button>

        {local?.screenSharing ? (
          <button
            type="button"
            onClick={stopLocalScreenShare}
            className="inline-flex items-center gap-2 rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-sm text-red-200 transition hover:bg-red-500/20"
          >
            <MonitorX size={16} />
            Parar compartilhamento
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void startLocalScreenShare()}
            className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200 transition hover:bg-emerald-500/20"
          >
            <MonitorUp size={16} />
            Compartilhar tela
          </button>
        )}

        <button
          type="button"
          onClick={() => setParticipantCameraOn(CALL_DEMO_IDS.remoteId, !(remote?.cameraOn ?? false))}
          className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-neutral-900 px-3 py-2 text-sm text-white transition hover:bg-neutral-800"
        >
          {(remote?.cameraOn ?? false) ? <VideoOff size={16} /> : <Video size={16} />}
          {(remote?.cameraOn ?? false) ? "Simular remoto sem câmera" : "Simular remoto com câmera"}
        </button>
      </div>
      <p className="text-xs text-neutral-400">
        Este demo usa seu `getUserMedia` e `getDisplayMedia` para o participante local.
      </p>
    </div>
  );
}

export function VideoCallDemo() {
  return (
    <CallStateProvider>
      <div className="space-y-4">
        <DemoControls />
        <VideoCallLayout />
      </div>
    </CallStateProvider>
  );
}
