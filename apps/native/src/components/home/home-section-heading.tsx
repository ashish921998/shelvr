import { ThemedText } from "@/components/ui/themed-text";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function HomeSectionHeading({
  title,
  action,
}: {
  title: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.heading}>
      <ThemedText
        variant="title"
        accessibilityRole="header"
        style={styles.title}
      >
        {title}
      </ThemedText>
      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <ThemedText variant="subheadStrong" style={styles.link}>
            {action.label}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1),
  },
  title: { flexShrink: 1 },
  action: {
    minHeight: theme.control.minHeight,
    flexShrink: 1,
    justifyContent: "center",
    paddingStart: theme.gap(1),
  },
  link: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
}));
