import * as Haptics from "expo-haptics";
import { afterEach, describe, expect, it, vi } from "vitest";
import { haptics } from "./haptics";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("haptics", () => {
  it("uses a selection tick, light impact, and success pulse on iOS", async () => {
    vi.stubEnv("EXPO_OS", "ios");
    await haptics.selection();
    await haptics.impact();
    await haptics.success();
    expect(Haptics.selectionAsync).toHaveBeenCalledOnce();
    expect(Haptics.impactAsync).toHaveBeenCalledWith(
      Haptics.ImpactFeedbackStyle.Light,
    );
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it("uses the Android haptic engine for equivalent feedback", async () => {
    vi.stubEnv("EXPO_OS", "android");
    await haptics.selection();
    await haptics.impact();
    await haptics.success();
    expect(vi.mocked(Haptics.performAndroidHapticsAsync).mock.calls).toEqual([
      [Haptics.AndroidHaptics.Segment_Tick],
      [Haptics.AndroidHaptics.Drag_Start],
      [Haptics.AndroidHaptics.Confirm],
    ]);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
  });

  it("keeps the web quiet", async () => {
    vi.stubEnv("EXPO_OS", "web");
    await haptics.selection();
    await haptics.impact();
    await haptics.success();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(Haptics.performAndroidHapticsAsync).not.toHaveBeenCalled();
  });

  it("does not turn unavailable feedback into a failed action", async () => {
    vi.stubEnv("EXPO_OS", "ios");
    vi.mocked(Haptics.notificationAsync).mockRejectedValueOnce(
      new Error("Unavailable"),
    );
    await expect(haptics.success()).resolves.toBeUndefined();
    vi.mocked(Haptics.selectionAsync).mockImplementationOnce(() => {
      throw new Error("Unavailable");
    });
    await expect(haptics.selection()).resolves.toBeUndefined();
  });
});
