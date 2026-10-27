import type { ReviewSave } from "@/components/home/review-saves";
import { useFixSave } from "@/lib/fix-save";
import { useHomeFeed } from "@/lib/home-feed";
import { canRetrySave, newlyUnplaced, saveSource } from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Pressable, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

const TOAST_MS = 6000;

/** The save that finished reading without a city since the last feed update, if one did. */
function useNewlyUnplaced(
  items: ReviewSave[] | undefined,
): [ReviewSave | null, () => void] {
  const statuses = useRef(new Map<string, ReviewSave["status"]>());
  const [save, setSave] = useState<ReviewSave | null>(null);
  useEffect(() => {
    if (items === undefined) return;
    const landed = newlyUnplaced(statuses.current, items);
    statuses.current = new Map(items.map((item) => [item._id, item.status]));
    if (landed.length > 0) setSave(landed[0]);
  }, [items]);
  const dismiss = useCallback(() => setSave(null), []);
  return [save, dismiss];
}

/**
 * Says so the moment a save the app watched being read lands with no place,
 * instead of leaving it to sit in a list on Home. Saves that failed while the
 * app was closed wait behind Home's review line.
 */
export function UnplacedToast() {
  useAppLocale();
  const router = useRouter();
  const { items } = useHomeFeed();
  const [save, dismiss] = useNewlyUnplaced(items);
  const { retry } = useFixSave();

  useEffect(() => {
    if (save === null) return;
    AccessibilityInfo.announceForAccessibility(t("homePlaces.toastNoPlace"));
    const timer = setTimeout(dismiss, TOAST_MS);
    return () => clearTimeout(timer);
  }, [save, dismiss]);

  if (save === null) return null;
  const retryable = canRetrySave(save);
  const source = saveSource(save);
  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <Animated.View
        entering={FadeInDown}
        exiting={FadeOutDown}
        style={styles.toast}
        accessibilityRole="alert"
        testID="unplaced-toast"
      >
        <View style={styles.text}>
          <Text style={styles.title}>{t("homePlaces.toastNoPlace")}</Text>
          {source ? (
            <Text style={styles.source} numberOfLines={1}>
              {source}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => {
            dismiss();
            if (retryable) void retry(save);
            else
              router.push({
                pathname: "/item/[id]",
                params: { id: save._id, from: "home" },
              });
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.actionLabel}>
            {retryable ? t("common.retry") : t("homePlaces.toastView")}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.dismiss")}
          hitSlop={8}
          onPress={dismiss}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={styles.close}>✕</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  overlay: {
    position: "absolute",
    // Above the floating tab bar, clear of the header's Profile and Add buttons.
    bottom: rt.insets.bottom + theme.gap(8),
    left: theme.gap(2),
    right: theme.gap(2),
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.18)",
  },
  text: { flex: 1, gap: 2 },
  title: { ...theme.type.subheadStrong, color: theme.colors.background },
  source: { ...theme.type.footnote, color: theme.colors.border },
  action: { paddingVertical: theme.gap(0.5) },
  actionLabel: { ...theme.type.subheadStrong, color: theme.colors.primary },
  close: { ...theme.type.subheadStrong, color: theme.colors.border },
  pressed: { opacity: theme.opacity.pressed },
}));
