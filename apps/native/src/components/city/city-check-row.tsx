import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { haptics } from "@/lib/haptics";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function CityCheckRow({
  title,
  detail,
  note,
  noteTestID,
  selected,
  disabled = false,
  onPress,
}: {
  title: string;
  detail: string;
  note?: string;
  noteTestID?: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={
        note ? `${title}, ${detail}, ${note}` : `${title}, ${detail}`
      }
      accessibilityState={{ checked: selected, disabled }}
      disabled={disabled}
      onPress={() => {
        void haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.cityRow,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <View style={styles.cityText}>
        <ThemedText variant="subheadStrong">{title}</ThemedText>
        <ThemedText variant="footnote" style={styles.muted}>
          {detail}
        </ThemedText>
        {note ? (
          <ThemedText
            testID={noteTestID}
            variant="footnote"
            style={[styles.muted, styles.note]}
          >
            {note}
          </ThemedText>
        ) : null}
      </View>
      <View style={[styles.check, selected && styles.checkOn]}>
        {selected ? (
          <AppSymbolIcon
            name="checkmark"
            size={14}
            weight="bold"
            tintColor={theme.colors.surface}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  cityRow: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  cityText: { flex: 1, gap: theme.gap(0.25) },
  note: { paddingTop: theme.gap(0.25) },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkOn: {
    borderColor: theme.colors.foreground,
    backgroundColor: theme.colors.foreground,
  },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
