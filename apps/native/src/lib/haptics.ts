import * as Haptics from "expo-haptics";

type Feedback = "selection" | "impact" | "success";

async function playOptionalFeedback(kind: Feedback): Promise<void> {
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
    return;
  }
}

export const haptics = {
  selection: () => playOptionalFeedback("selection"),
  impact: () => playOptionalFeedback("impact"),
  success: () => playOptionalFeedback("success"),
};
