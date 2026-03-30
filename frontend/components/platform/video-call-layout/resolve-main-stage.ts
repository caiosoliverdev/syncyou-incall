"use client";

import {
  type CallState,
  stageForAvatar,
  stageForScreen,
  type StageTarget,
} from "./types";

function hasLiveVideo(stream?: MediaStream | null): boolean {
  if (!stream) return false;
  return stream.getVideoTracks().some((track) => track.readyState === "live");
}

export function resolveMainStage(state: CallState): StageTarget {
  const screenOwner = state.participants.find((participant) => {
    if (!participant.screenSharing) return false;
    return hasLiveVideo(participant.screenStream);
  });
  if (screenOwner) return stageForScreen(screenOwner.id);

  const remoteCamera = state.participants.find((participant) => {
    if (participant.isLocal) return false;
    if (!participant.cameraOn) return false;
    return hasLiveVideo(participant.cameraStream ?? participant.stream);
  });
  if (remoteCamera) return remoteCamera.id;

  const localCamera = state.participants.find((participant) => {
    if (!participant.isLocal) return false;
    if (!participant.cameraOn) return false;
    return hasLiveVideo(participant.cameraStream ?? participant.stream);
  });
  if (localCamera) return localCamera.id;

  const remote = state.participants.find((participant) => !participant.isLocal);
  if (remote) return stageForAvatar(remote.id);

  const first = state.participants[0];
  return stageForAvatar(first?.id ?? "none");
}

export function isStageTargetValid(state: CallState, target: StageTarget): boolean {
  const participants = state.participants;
  if (!target) return false;
  if (target.startsWith("screen:")) {
    const ownerId = target.slice("screen:".length);
    const owner = participants.find((participant) => participant.id === ownerId);
    return Boolean(owner?.screenSharing);
  }
  if (target.startsWith("avatar:")) {
    const ownerId = target.slice("avatar:".length);
    return participants.some((participant) => participant.id === ownerId);
  }
  return participants.some((participant) => participant.id === target);
}
