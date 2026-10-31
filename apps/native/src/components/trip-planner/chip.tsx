import { ThemedText } from "@/components/ui/themed-text";
import { haptics } from "@/lib/haptics";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** A picked chip's fill and the colour of the text (and dot) on it. */
export type ChipFill = { background: string; foreground: string };

/**
 * A selectable pill. `pick` says how it reads to VoiceOver and TalkBack: one of a set
 * ("radio") or one of several that can be on together ("checkbox"), each with its
 * checked state, so the selection is announced on both platforms. A picked chip fills
 * with `fill`, which the caller takes from the theme. `dot` adds a small swatch in that
 * colour while the chip is off; once picked the dot takes the fill's foreground.
 */
export function Chip({
  label,
  detail,
  selected,
  pick,
  fill,
  dot,
  onPress,
}: {
  label: string;
  detail?: string;
  selected: boolean;
  pick: "radio" | "checkbox";
  fill: ChipFill;
  dot?: string;
  onPress: () => void;
}) {
  const onFill = selected ? { color: fill.foreground } : undefined;
  return (
    <Pressable
      accessibilityRole={pick}
      accessibilityLabel={detail ? `${label}, ${detail}` : label}
      accessibilityState={{ checked: selected }}
      hitSlop={4}
      onPress={() => {
        if (pick === "radio" && selected) return;
        void haptics.selection();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected && {
          borderColor: fill.background,
          backgroundColor: fill.background,
        },
        pressed && styles.pressed,
      ]}
    >
      {dot ? (
        <View
          style={[
            styles.dot,
            { backgroundColor: selected ? fill.foreground : dot },
          ]}
        />
      ) : null}
      {/* One weight in both states: a bolder selected label would widen the chip and rewrap the row. */}
      <ThemedText variant="label" numberOfLines={1} style={onFill}>
        {label}
      </ThemedText>
      {detail ? (
        <ThemedText variant="captionLabel" style={onFill ?? styles.muted}>
          {detail}
        </ThemedText>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  chip: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.75),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
