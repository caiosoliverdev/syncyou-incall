import { describe, expect, it } from "vitest";
import {
  resolveLayoutMode,
  resolveMainStage,
  resolveSelfView,
  resolveSidebarItems,
  type LayoutState,
} from "./layout-resolvers";

function mkState(partial?: Partial<LayoutState>): LayoutState {
  return {
    participants: [
      {
        id: "local",
        isLocal: true,
        camera: { type: "camera", active: false },
        screen: { type: "screen", active: false },
      },
      {
        id: "remote",
        isLocal: false,
        camera: { type: "camera", active: false },
        screen: { type: "screen", active: false },
      },
    ],
    selectedMain: null,
    pinnedMain: null,
    selfSwapTarget: null,
    ...partial,
  };
}

describe("layout-resolvers", () => {
  it("uses remote camera over avatar in normal mode", () => {
    const state = mkState({
      participants: [
        {
          id: "local",
          isLocal: true,
          camera: { type: "camera", active: false },
          screen: { type: "screen", active: false },
        },
        {
          id: "remote",
          isLocal: false,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: false },
        },
      ],
    });
    expect(resolveLayoutMode(state)).toBe("normal");
    expect(resolveMainStage(state)).toBe("remote");
  });

  it("prioritizes screen-share in main stage", () => {
    const state = mkState({
      participants: [
        {
          id: "local",
          isLocal: true,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: true },
        },
        {
          id: "remote",
          isLocal: false,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: false },
        },
      ],
    });
    expect(resolveLayoutMode(state)).toBe("screen-share");
    expect(resolveMainStage(state)).toBe("screen:local");
    expect(resolveSelfView(state)).toBeNull();
  });

  it("supports both users sharing with 4 sidebar cards", () => {
    const state = mkState({
      participants: [
        {
          id: "local",
          isLocal: true,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: true },
        },
        {
          id: "remote",
          isLocal: false,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: true },
        },
      ],
    });
    const items = resolveSidebarItems(state).map((i) => i.id);
    expect(items).toEqual(["local", "screen:local", "remote", "screen:remote"]);
  });

  it("returns self view in normal mode when local camera active", () => {
    const state = mkState({
      participants: [
        {
          id: "local",
          isLocal: true,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: false },
        },
        {
          id: "remote",
          isLocal: false,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: false },
        },
      ],
    });
    expect(resolveMainStage(state)).toBe("remote");
    expect(resolveSelfView(state)).toBe("local");
  });

  it("keeps pinned target as main when valid", () => {
    const state = mkState({
      participants: [
        {
          id: "local",
          isLocal: true,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: false },
        },
        {
          id: "remote",
          isLocal: false,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: true },
        },
      ],
      pinnedMain: "local",
    });
    expect(resolveMainStage(state)).toBe("local");
  });

  it("auto-enters presentation when a screen starts even with camera previously selected", () => {
    const state = mkState({
      participants: [
        {
          id: "local",
          isLocal: true,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: false },
        },
        {
          id: "remote",
          isLocal: false,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: true },
        },
      ],
      selectedMain: "remote",
    });
    expect(resolveLayoutMode(state)).toBe("screen-share");
    expect(resolveMainStage(state)).toBe("screen:remote");
  });

  it("returns to normal mode when nobody is presenting", () => {
    const state = mkState({
      participants: [
        {
          id: "local",
          isLocal: true,
          camera: { type: "camera", active: true },
          screen: { type: "screen", active: false },
        },
        {
          id: "remote",
          isLocal: false,
          camera: { type: "camera", active: false },
          screen: { type: "screen", active: false },
        },
      ],
      selectedMain: "screen:local",
    });
    expect(resolveLayoutMode(state)).toBe("normal");
    expect(resolveSidebarItems(state)).toEqual([]);
    expect(resolveMainStage(state)).toBe("avatar:remote");
  });
});
