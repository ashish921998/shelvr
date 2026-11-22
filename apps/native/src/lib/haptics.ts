import * as Haptics from "expo-haptics";

type Feedback = "selection" | "impact" | "landing" | "success";

async function playOptionalFeedback(
  kind: Feedback,
  impactStyle = Haptics.ImpactFeedbackStyle.Light,
): Promise<void> {
  if (process.env.EXPO_OS === "web") return;
  try {
    if (process.env.EXPO_OS === "android") {
      const effect = {
        selection: Haptics.AndroidHaptics.Segment_Tick,
        impact: Haptics.AndroidHaptics.Drag_Start,
        landing: Haptics.AndroidHaptics.Gesture_End,
        success: Haptics.AndroidHaptics.Confirm,
      }[kind];
      await Haptics.performAndroidHapticsAsync(effect);
    } else if (kind === "selection") {
      await Haptics.selectionAsync();
    } else if (kind === "impact" || kind === "landing") {
      await Haptics.impactAsync(impactStyle);
    } else {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  } catch {
    return;
  }
}

function rollDice() {
  if (process.env.EXPO_OS !== "ios") {
    void playOptionalFeedback("impact");
    return () => {};
  }
  const {
    Heavy: heavy,
    Light: light,
    Medium: medium,
  } = Haptics.ImpactFeedbackStyle;
  void playOptionalFeedback("impact", heavy);
  const beats = [
    [190, light],
    [380, light],
    [628, heavy],
    [780, light],
    [908, medium],
    [985, light],
  ] as const;
  const timers = beats.map(([delay, strength]) =>
    setTimeout(() => void playOptionalFeedback("impact", strength), delay),
  );
  return () => timers.forEach((timer) => clearTimeout(timer));
}

export const haptics = {
  rollDice,
  landing: () =>
    playOptionalFeedback("landing", Haptics.ImpactFeedbackStyle.Soft),
  selection: () => playOptionalFeedback("selection"),
  impact: (strength: "light" | "medium" = "light") =>
    playOptionalFeedback(
      "impact",
      strength === "medium"
        ? Haptics.ImpactFeedbackStyle.Medium
        : Haptics.ImpactFeedbackStyle.Light,
    ),
  success: () => playOptionalFeedback("success"),
};
