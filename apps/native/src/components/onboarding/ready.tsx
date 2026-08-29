import { CtaButton } from '@/components/onboarding/parts';
import { ItemCard, type FeedItem } from '@/components/item-card';
import { AppSymbolIcon } from '@/components/symbol';
import { Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// Step 9 — the recap. Shows the spaces the user just created as chips, the demo
// item (if they did step 6) as a real ItemCard, and the share-sheet tip — then
// hands off to the existing finish() for the trial paywall. This is the "your
// profile is ready" beat from the funnels; everything on it is real state.
export function ReadyStep({
  spaceNames,
  demoItem,
  onFinish,
}: {
  spaceNames: string[];
  demoItem: FeedItem | null;
  onFinish: () => void;
}) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.wrap}>
      <Animated.Text entering={FadeInDown.duration(400)} style={styles.headline}>
        Your shelf is ready.
      </Animated.Text>

      {spaceNames.length > 0 && (
        <Animated.View entering={FadeInDown.delay(80).duration(400)} style={styles.chips}>
          {spaceNames.map((name) => (
            <View key={name} style={styles.chip}>
              <Text style={styles.chipLabel}>{name}</Text>
            </View>
          ))}
        </Animated.View>
      )}

      {demoItem && (
        <Animated.View entering={FadeIn.delay(200).duration(400)}>
          <ItemCard item={demoItem} />
        </Animated.View>
      )}

      <Animated.View entering={FadeInDown.delay(280).duration(400)} style={styles.tip}>
        <AppSymbolIcon name="square.and.arrow.up" size={16} tintColor={theme.colors.muted} />
        <Text style={styles.tipText}>Save from any app with the share sheet.</Text>
      </Animated.View>

      <View style={styles.footer}>
        <Animated.View entering={FadeInDown.delay(360).duration(400)} style={styles.fullWidth}>
          <CtaButton label="Start saving" onPress={onFinish} />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2.5),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.gap(1),
  },
  chip: {
    backgroundColor: theme.colors.primarySoft,
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    borderRadius: 50,
  },
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.primaryText,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(1),
  },
  tipText: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
  },
  footer: {
    marginTop: 'auto',
    width: '100%',
  },
  fullWidth: {
    width: '100%',
  },
}));
