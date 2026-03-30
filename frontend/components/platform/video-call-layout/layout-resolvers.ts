"use client";

import { stageForAvatar, stageForScreen, type StageTarget } from "./types";

export type MediaSource = {
  type: "camera" | "screen";
  active: boolean;
};

export type ParticipantState = {
  id: string;
  isLocal: boolean;
  camera: MediaSource;
  screen: MediaSource;
};

export type LayoutState = {
  participants: ParticipantState[];
  selectedMain?: StageTarget | null;
  pinnedMain?: StageTarget | null;
  selfSwapTarget?: StageTarget | null;
};

export type LayoutMode = "normal" | "screen-share";

export type SidebarItem = {
  id: StageTarget;
  participantId: string;
  kind: "camera" | "screen" | "avatar";
};

function parseTarget(target: StageTarget): { kind: "screen" | "avatar" | "participant"; id: string } {
  if (target.startsWith("screen:")) return { kind: "screen", id: target.slice("screen:".length) };
  if (target.startsWith("avatar:")) return { kind: "avatar", id: target.slice("avatar:".length) };
  return { kind: "participant", id: target };
}

function participantById(state: LayoutState, id: string): ParticipantState | undefined {
  return state.participants.find((p) => p.id === id);
}

function isTargetValid(state: LayoutState, target: StageTarget | null | undefined): target is StageTarget {
  if (!target) return false;
  const parsed = parseTarget(target);
  const p = participantById(state, parsed.id);
  if (!p) return false;
  if (parsed.kind === "screen") return p.screen.active;
  if (parsed.kind === "avatar") return true;
  return p.camera.active;
}

function getLocal(state: LayoutState): ParticipantState | undefined {
  return state.participants.find((p) => p.isLocal);
}

function getRemote(state: LayoutState): ParticipantState | undefined {
  return state.participants.find((p) => !p.isLocal);
}

export function resolveLayoutMode(state: LayoutState): LayoutMode {
  return state.participants.some((p) => p.screen.active) ? "screen-share" : "normal";
}

export function resolveMainStage(state: LayoutState): StageTarget {
  const mode = resolveLayoutMode(state);
  if (isTargetValid(state, state.pinnedMain)) return state.pinnedMain;

  // In screen-share mode, auto-enter presentation immediately.
  // Only keep manual selection when user selected another active screen target.
  if (mode === "screen-share" && isTargetValid(state, state.selectedMain)) {
    const parsed = parseTarget(state.selectedMain);
    if (parsed.kind === "screen") return state.selectedMain;
  }

  // In normal mode, only keep explicit local promotion. Remote camera should auto-take stage.
  if (mode === "normal") {
    const local = getLocal(state);
    if (
      local &&
      state.selectedMain === local.id &&
      isTargetValid(state, state.selectedMain)
    ) {
      return state.selectedMain;
    }
  }

  if (mode === "screen-share") {
    const local = getLocal(state);
    const remote = getRemote(state);
    if (local?.screen.active) return stageForScreen(local.id);
    if (remote?.screen.active) return stageForScreen(remote.id);
  }

  const remote = getRemote(state);
  if (remote?.camera.active) return remote.id;

  const local = getLocal(state);
  if (local?.camera.active && state.selectedMain === local.id) return local.id;

  if (remote) return stageForAvatar(remote.id);
  if (local) return stageForAvatar(local.id);
  return stageForAvatar("none");
}

export function resolveSidebarItems(state: LayoutState): SidebarItem[] {
  if (resolveLayoutMode(state) !== "screen-share") return [];
  const local = getLocal(state);
  const remote = getRemote(state);
  const items: SidebarItem[] = [];

  if (local) {
    if (local.camera.active) {
      items.push({ id: local.id, participantId: local.id, kind: "camera" });
    }
    if (local.screen.active) {
      items.push({ id: stageForScreen(local.id), participantId: local.id, kind: "screen" });
    }
  }
  if (remote) {
    items.push({
      id: remote.camera.active ? remote.id : stageForAvatar(remote.id),
      participantId: remote.id,
      kind: remote.camera.active ? "camera" : "avatar",
    });
    if (remote.screen.active) {
      items.push({ id: stageForScreen(remote.id), participantId: remote.id, kind: "screen" });
    }
  }
  return items;
}

export function resolveSelfView(state: LayoutState): StageTarget | null {
  if (resolveLayoutMode(state) === "screen-share") return null;
  const local = getLocal(state);
  if (!local?.camera.active) return null;
  const main = resolveMainStage(state);
  if (main !== local.id) return local.id;
  if (isTargetValid(state, state.selfSwapTarget) && state.selfSwapTarget !== local.id) {
    return state.selfSwapTarget;
  }
  const remote = getRemote(state);
  if (!remote) return null;
  return remote.camera.active ? remote.id : stageForAvatar(remote.id);
}
