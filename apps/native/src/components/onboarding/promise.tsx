import { CtaButton, FeatureRow } from '@/components/onboarding/parts';
import { Wordmark } from '@/components/wordmark';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';

// Step 1 — the value promise. Reuses the three FeatureRows the v1 single-screen
// flow shipped with verbatim (same copy + icons), promoted to the hero position.
// One screen, not a carousel — the survey carries the momentum from here.
export function PromiseStep({ onAdvance }: { onAdvance: () => void }) {
  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeInDown.duration(500)} style={styles.hero}>
        <Wordmark size={44} />
        <Text style={styles.slogan}>Save it for later.</Text>
      </Animated.View>

      <View style={styles.features}>
        <FeatureRow
          delay={150}
          icon="square.grid.2x2"
          title="One warm shelf"
          message="Links, photos, notes — everything lands in one calm masonry feed."
        />
        <FeatureRow
          delay={280}
          icon="sparkles"
          title="Shelvr tags it for you"
          message="Every save is read, titled, and tagged, then filed into your spaces."
        />
        <FeatureRow
          delay={410}
          icon="doc.text"
          title="Read it right here"
          message="Saved articles open in a clean, quiet reader — no tabs, no clutter."
        />
      </View>

      <Animated.View entering={FadeInDown.delay(540).duration(400)}>
        <CtaButton label="Get started" onPress={onAdvance} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    gap: theme.gap(4),
  },
  hero: {
    alignItems: 'center',
    gap: theme.gap(1),
  },
  slogan: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.muted,
  },
  features: {
    gap: theme.gap(2.5),
  },
}));
