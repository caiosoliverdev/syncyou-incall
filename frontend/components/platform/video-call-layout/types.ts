"use client";

export type StageTarget = string;

export type Participant = {
  id: string;
  name: string;
  isLocal: boolean;
  cameraOn: boolean;
  screenSharing: boolean;
  stream?: MediaStream;
  cameraStream?: MediaStream | null;
  screenStream?: MediaStream | null;
  avatarUrl?: string | null;
};

export type CallState = {
  participants: Participant[];
  activeMain: StageTarget;
  screenShareOwnerId?: string;
};

export const STAGE_AVATAR_PREFIX = "avatar:";
export const STAGE_SCREEN_PREFIX = "screen:";

export function stageForScreen(participantId: string): StageTarget {
  return `${STAGE_SCREEN_PREFIX}${participantId}`;
}

export function stageForAvatar(participantId: string): StageTarget {
  return `${STAGE_AVATAR_PREFIX}${participantId}`;
}

export function isScreenStage(target: StageTarget): boolean {
  return target.startsWith(STAGE_SCREEN_PREFIX);
}

export function stageParticipantId(target: StageTarget): string {
  const i = target.indexOf(":");
  return i >= 0 ? target.slice(i + 1) : target;
}
