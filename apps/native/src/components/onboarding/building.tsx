import { api } from '@convex/_generated/api';
import { useConvexAuth, useMutation } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// Step 5 — the "preparing your shelf" beat. Styled like Opal's report interstitial:
// a rotating status line over a spinner, while the real work (one createSpace
// mutation per selected name) happens behind it. On settle OR a hard cap the
// step advances regardless — spaces are recreatable in-app, so a network failure
// here must never block the funnel.
const MIN_DURATION_MS = 1800;
const HARD_CAP_MS = 6000;

const ROTATING_LINES = ['Warming the shelves', 'Teaching Shelvr your taste', 'Sorting your saves'];

export function BuildingStep({
  spaceNames,
  entitled,
  onDone,
}: {
  spaceNames: string[];
  entitled: boolean;
  onDone: () => void;
}) {
  const { theme } = useUnistyles();
  const { isAuthenticated } = useConvexAuth();
  const createSpace = useMutation(api.spaces.createSpace);
  const startedRef = useRef(false);
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

  // Fire all createSpace calls once. When unauthenticated (pre-sign-in
  // onboarding), skip mutations entirely — spaces will be replayed after
  // sign-in by the pending-onboarding hook. Failures are swallowed: a flaky
  // network can't strand the user here.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const start = Date.now();
    // Only create spaces when authenticated AND entitled — createSpace is
    // Pro-gated on the server. When not entitled, skip mutations; spaces
    // are stashed by the onboarding finish() for replay after purchase.
    const canCreate = isAuthenticated && entitled;
    const create =
      canCreate
        ? Promise.allSettled(
            spaceNames.map((name) => createSpace({ name }).catch(() => undefined)),
          )
        : Promise.resolve();

    let done = false;
    const advance = () => {
      if (done) return;
      done = true;
      const elapsed = Date.now() - start;
      const wait = Math.max(0, MIN_DURATION_MS - elapsed);
      setTimeout(onDone, wait);
    };

    // Never let a hung mutation wedge the funnel — the hard cap advances even
    // if allSettled hasn't settled.
    const cap = setTimeout(advance, HARD_CAP_MS);
    create.then(() => {
      clearTimeout(cap);
      advance();
    });
    return () => clearTimeout(cap);
  }, [spaceNames, createSpace, onDone, isAuthenticated, entitled]);

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
