import * as Haptics from "expo-haptics";

type Feedback = "selection" | "impact" | "success";

/** Feedback is optional: unavailable hardware must never fail a save or edit. */
async function play(kind: Feedback): Promise<void> {
  if (process.env.EXPO_OS === "web") return;
  try {
    if (process.env.EXPO_OS === "android") {
      const effect = {
        selection: Haptics.AndroidHaptics.Segment_Tick,
        impact: Haptics.AndroidHaptics.Drag_Start,
        success: Haptics.AndroidHaptics.Confirm,
      }[kind];
      await Haptics.performAndroidHapticsAsync(effect);
    } else if (kind === "selection") {
      await Haptics.selectionAsync();
    } else if (kind === "impact") {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    // System settings, device capabilities, and native availability can suppress feedback.
  }
}

export const haptics = {
  selection: () => play("selection"),
  impact: () => play("impact"),
  success: () => play("success"),
};
