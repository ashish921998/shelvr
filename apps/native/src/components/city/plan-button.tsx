import type { CityPlanKind } from "@/lib/city-plan";
import { t } from "@/lib/i18n";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function PlanButton({
  kind,
  busy,
  onPress,
}: {
  kind: CityPlanKind;
  busy: CityPlanKind | null;
  onPress: () => void;
}) {
  const label = t(
    kind === "date" ? "homePlaces.planDate" : "homePlaces.planTrip",
  );
  const hint = t(
    kind === "date" ? "homePlaces.planDateHint" : "homePlaces.planTripHint",
  );
  const dark = kind === "date";
  const working = busy === kind;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy !== null, busy: working }}
      disabled={busy !== null}
      onPress={onPress}
      style={({ pressed }) => [
        styles.planButton,
        dark ? styles.planDark : styles.planMuted,
        (pressed || (busy !== null && !working)) && styles.pressed,
      ]}
    >
      {working ? (
        <ActivityIndicator />
      ) : (
        <>
          <Text style={[styles.planLabel, dark && styles.onDark]}>{label}</Text>
          <Text style={[styles.planHint, dark && styles.onDark]}>{hint}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  planButton: {
    flex: 1,
    minHeight: theme.control.minHeight,
    gap: theme.gap(0.25),
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
  },
  planDark: { backgroundColor: theme.colors.foreground },
  planMuted: { backgroundColor: theme.colors.surfaceMuted },
  planLabel: { ...theme.type.button, color: theme.colors.foreground },
  planHint: { ...theme.type.caption, color: theme.colors.muted },
  onDark: { color: theme.colors.surface },
  pressed: { opacity: theme.opacity.pressed },
}));
