import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { DATE_OPTIONS, type DateOption } from "@/lib/date-plan";
import { t } from "@/lib/i18n";
import * as Haptics from "expo-haptics";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const ICONS: Record<DateOption["ask"], AppSymbolName> = {
  classic: "fork.knife",
  lowkey: "cup.and.saucer.fill",
  surprise: "sparkles",
};

function OptionRow({
  option,
  onPress,
}: {
  option: DateOption;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const label = t(option.label);
  const hint = t(option.hint);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${hint}`}
      onPress={() => {
        if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <AppSymbolIcon
          name={ICONS[option.ask]}
          size={18}
          tintColor={theme.colors.primaryText}
        />
      </View>
      <View style={styles.text}>
        <ThemedText variant="headline">{label}</ThemedText>
        <ThemedText variant="footnote" style={styles.muted}>
          {hint}
        </ThemedText>
      </View>
      <AppSymbolIcon
        name="chevron.right"
        size={14}
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

/** "What kind of date?": the kinds the planner makes. */
export function DateKindPicker({
  city,
  problem,
  onPick,
}: {
  city: string;
  problem: string | null;
  onPick: (ask: DateOption["ask"]) => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <ThemedText variant="largeTitle" accessibilityRole="header">
          {t("datePlan.title", { city })}
        </ThemedText>
        <ThemedText variant="subhead" style={styles.muted}>
          {t("datePlan.question")}
        </ThemedText>
      </View>
      {problem !== null ? (
        <ThemedText
          variant="footnote"
          accessibilityRole="alert"
          style={styles.problem}
        >
          {problem}
        </ThemedText>
      ) : null}
      <View style={styles.list}>
        {DATE_OPTIONS.map((option) => (
          <OptionRow
            key={option.ask}
            option={option}
            onPress={() => onPick(option.ask)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { gap: theme.gap(3) },
  heading: { gap: theme.gap(0.5) },
  muted: { color: theme.colors.muted },
  problem: { color: theme.colors.danger },
  list: { gap: theme.gap(1) },
  row: {
    minHeight: theme.control.minHeight + theme.gap(2),
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
}));
