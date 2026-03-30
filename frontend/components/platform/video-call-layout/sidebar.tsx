"use client";

import { useMemo } from "react";
import { useCallState } from "./call-state-context";
import { ParticipantCard } from "./participant-card";
import { stageForScreen } from "./types";

export function Sidebar() {
  const { state, setActiveMain } = useCallState();
  const local = useMemo(
    () => state.participants.find((participant) => participant.isLocal),
    [state.participants],
  );
  const remote = useMemo(
    () => state.participants.find((participant) => !participant.isLocal),
    [state.participants],
  );

  const hasScreen = Boolean(state.screenShareOwnerId);
  if (!hasScreen) return null;

  const screenOwner = state.participants.find(
    (participant) => participant.id === state.screenShareOwnerId,
  );
  const items = [
    screenOwner
      ? {
          key: stageForScreen(screenOwner.id),
          label: `${screenOwner.name} (tela)`,
          stream: screenOwner.screenStream,
          isScreen: true,
        }
      : null,
    local
      ? {
          key: local.id,
          label: `${local.name} (câmera)`,
          stream: local.cameraOn ? local.cameraStream ?? local.stream : null,
          isScreen: false,
        }
      : null,
    remote
      ? {
          key: remote.id,
          label: `${remote.name} (câmera)`,
          stream: remote.cameraOn ? remote.cameraStream ?? remote.stream : null,
          isScreen: false,
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    stream?: MediaStream | null;
    isScreen: boolean;
  }>;

  return (
    <aside className="w-72 shrink-0 animate-in slide-in-from-right-4 duration-300">
      <div className="h-full space-y-3 overflow-auto rounded-3xl border border-white/10 bg-neutral-900/60 p-3 backdrop-blur">
        {items.map((item) => (
          <ParticipantCard
            key={item.key}
            label={item.label}
            stageTarget={item.key}
            active={state.activeMain === item.key}
            stream={item.stream}
            isScreen={item.isScreen}
            onClick={setActiveMain}
          />
        ))}
      </div>
    </aside>
  );
}
