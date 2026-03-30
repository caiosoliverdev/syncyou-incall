"use client";

import { MainStage } from "./main-stage";
import { SelfView } from "./self-view";
import { Sidebar } from "./sidebar";
import { useCallState } from "./call-state-context";

export function VideoCallLayout() {
  const { state } = useCallState();
  const localPresenting = state.screenShareOwnerId
    ? state.participants.some(
        (participant) =>
          participant.id === state.screenShareOwnerId && participant.isLocal,
      )
    : false;

  return (
    <div className="h-[78vh] w-full rounded-3xl border border-white/10 bg-neutral-950/70 p-4 shadow-2xl">
      <div className="flex h-full gap-4">
        <div className="relative min-w-0 flex-1">
          <MainStage />
          <SelfView />
          {localPresenting ? (
            <div className="absolute left-4 top-4 z-40 rounded-full border border-emerald-400/30 bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">
              Você está apresentando
            </div>
          ) : null}
        </div>
        <Sidebar />
      </div>
    </div>
  );
}
