import { Text, View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { InkShelf } from "@/components/ink/ink-shelf";
import { INK_A11Y } from "@/components/ink/ink-canvas";
import type { PropKind } from "@/lib/ink/strokes";

// An empty state is a drawn shelf with nothing on it. The headline says what
// would go there; a single prop keeps the shelf from reading as a mistake.
// One accent at most — the rule that keeps ink from becoming a texture.

type Props = {
  title: string;
  message: string;
  /** Omit for the states the spec gives words only, such as empty search. */
  prop?: PropKind | null;
};

export function EmptyState({ title, message, prop = "mug" }: Props) {
  const { width } = useWindowDimensions();
  const shelfWidth = Math.min(width - 72, 260);

  return (
    <View style={styles.container}>
      {prop ? (
        <View style={styles.drawing} {...INK_A11Y}>
          <InkShelf width={shelfWidth} prop={prop} propAt={0.72} />
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(4),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    gap: theme.gap(1),
  },
  drawing: { marginBottom: theme.gap(2) },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
    textAlign: "center",
    lineHeight: 21,
  },
}));
