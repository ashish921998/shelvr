import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { DATE_OPTIONS, type DateOption } from "@/lib/date-plan";
import { t } from "@/lib/i18n";
import { haptics } from "@/lib/haptics";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const ICONS: Record<DateOption["ask"], AppSymbolName> = {
  classic: "fork.knife",
  lowkey: "cup.and.saucer.fill",
  surprise: "sparkles",
};

function OptionRow({
  option,
  onList,
  onPress,
}: {
  option: DateOption;
  onList: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const label = t(option.label);
  const hint =
    onList && option.ask === "surprise"
      ? t("sharedLists.dateSurpriseHint")
      : t(option.hint);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${hint}`}
      onPress={() => {
        void haptics.selection();
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

export function DateKindPicker({
  city,
  onList,
  problem,
  onPick,
  onPickFirst,
}: {
  city: string;
  onList: boolean;
  problem: string | null;
  onPick: (ask: DateOption["ask"]) => void;
  onPickFirst: () => void;
}) {
  return (
    <View style={styles.container}>
      <ThemedText variant="largeTitle" accessibilityRole="header">
        {t("datePlan.title", { city })}
      </ThemedText>
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
        <Pressable
          accessibilityRole="button"
          onPress={onPickFirst}
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <ThemedText variant="headline">{t("datePlan.pickFirst")}</ThemedText>
        </Pressable>
        {DATE_OPTIONS.map((option) => (
          <OptionRow
            key={option.ask}
            option={option}
            onList={onList}
            onPress={() => onPick(option.ask)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { gap: theme.gap(3) },
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
