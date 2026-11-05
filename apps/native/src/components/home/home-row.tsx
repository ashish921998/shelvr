import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function HomeRow({
  icon,
  title,
  value,
  tag,
  label,
  disabled,
  onPress,
}: {
  icon: AppSymbolName;
  title: string;
  value?: string;
  tag?: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <AppSymbolIcon name={icon} size={22} tintColor={theme.colors.primary} />
      <ThemedText style={styles.title} numberOfLines={1}>
        {title}
      </ThemedText>
      {tag ? (
        <View style={styles.tag}>
          <ThemedText variant="captionStrong" style={styles.tagText}>
            {tag}
          </ThemedText>
        </View>
      ) : null}
      <ThemedText variant="footnote" style={styles.value} numberOfLines={1}>
        {value}
      </ThemedText>
      <AppSymbolIcon
        name="chevron.right"
        size={14}
        tintColor={theme.colors.faint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.control.minHeight + theme.gap(0.5),
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
  title: { flexShrink: 1 },
  tag: {
    paddingHorizontal: theme.gap(0.75),
    paddingVertical: theme.gap(0.25),
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  tagText: { color: theme.colors.primaryText },
  value: { flex: 1, textAlign: "right", color: theme.colors.muted },
}));
