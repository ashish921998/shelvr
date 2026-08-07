import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// Step 5 — the "preparing your shelf" beat. This is deliberately a visual
// interstitial only. Persistence happens after onboarding through the durable,
// idempotent replay path so a failed request cannot silently lose a space.
const MIN_DURATION_MS = 1800;

const ROTATING_LINES = ['Warming the shelves', 'Teaching Shelvr your taste', 'Sorting your saves'];

export function BuildingStep({ onDone }: { onDone: () => void }) {
  const { theme } = useUnistyles();
  const [line, setLine] = useState(ROTATING_LINES[0]);

  // Rotate the status copy on an interval — gives the beat motion independent
  // of how fast the mutations resolve.
  useEffect(() => {
    const id = setInterval(() => {
      setLine((prev) => {
        const next = ROTATING_LINES.indexOf(prev) + 1;
        return ROTATING_LINES[next % ROTATING_LINES.length];
      });
    }, 1100);
    return () => clearInterval(id);
  }, []);

  // Keep the beat long enough to communicate progress, but never perform
  // backend work from a presentation component. The pending replay hook owns
  // persistence and can retry it after sign-in or a transient failure.
  useEffect(() => {
    const id = setTimeout(onDone, MIN_DURATION_MS);
    return () => clearTimeout(id);
  }, [onDone]);

  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.center}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.line}>{line}…</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    gap: theme.gap(2),
  },
  line: {
    fontFamily: theme.fonts.medium,
    fontSize: 17,
    color: theme.colors.foreground,
  },
}));
