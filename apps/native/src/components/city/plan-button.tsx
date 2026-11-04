import type { CityPlanKind } from "@/lib/city-plan";
import { t } from "@/lib/i18n";
import { ActivityIndicator, Pressable, Text } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { AppSymbolIcon } from "@/components/symbol";

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

export function InviteButton({
  disabled,
  onPress,
}: {
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const label = t("sharedLists.invite");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sharedLists.start")}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        styles.invite,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <AppSymbolIcon
        name="person.badge.plus"
        size={15}
        tintColor={theme.colors.foreground}
      />
      <Text style={styles.inviteLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  invite: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  inviteLabel: { ...theme.type.subhead, color: theme.colors.foreground },
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
