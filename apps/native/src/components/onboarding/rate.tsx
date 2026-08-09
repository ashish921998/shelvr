import { analytics } from '@/lib/analytics';
import { Icon } from '@/components/symbol';
import { Linking, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

const APP_STORE_ID = '6798143550';

// Step 8 — the rate-us beat. Laurels + a line that frames Shelvr as built for
// this user. The CTA opens the App Store review page via deep link (not the
// native requestReview() sheet) so it does NOT consume Apple's ~3/year review
// prompt quota. The native sheet is reserved for the post-onboarding hook that
// fires after the user has experienced real AI-classified saves.
// The secondary "Not now" always advances too.
export function RateStep({ onAdvance }: { onAdvance: () => void }) {
  const { theme } = useUnistyles();

  const rate = async () => {
    try {
      analytics.capture('review_link_opened');
      await Linking.openURL(
        `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`,
      );
    } catch {
      // Best-effort — advance regardless.
    }
    onAdvance();
  };

  return (
    <View style={styles.wrap}>
      <Animated.View entering={FadeIn.duration(500)} style={styles.laurels}>
        <Icon name="star.fill" size={20} tintColor={theme.colors.primary} />
        <Icon name="star.fill" size={28} tintColor={theme.colors.primary} />
        <Icon name="star.fill" size={20} tintColor={theme.colors.primary} />
      </Animated.View>

      <Animated.Text entering={FadeInDown.delay(120).duration(400)} style={styles.headline}>
        Enjoying Shelvr so far?
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(200).duration(400)} style={styles.support}>
        If you have a moment, you can leave a review. No pressure — you can always do it later.
      </Animated.Text>

      <View style={styles.footer}>
        <Animated.View entering={FadeInDown.delay(320).duration(400)} style={styles.fullWidth}>
          <Pressable
            onPress={rate}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.ctaText}>Leave a review</Text>
          </Pressable>
        </Animated.View>
        <Pressable onPress={onAdvance}>
          <Text style={styles.notNow}>Not now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    alignItems: 'center',
    gap: theme.gap(2),
  },
  laurels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(1),
    marginTop: theme.gap(4),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
    textAlign: 'center',
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
    width: '100%',
    alignItems: 'center',
    gap: theme.gap(1.5),
  },
  fullWidth: {
    width: '100%',
  },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    paddingVertical: theme.gap(2),
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: '#fff',
  },
  notNow: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
}));
