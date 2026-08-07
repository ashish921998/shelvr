import { CtaButton } from '@/components/onboarding/parts';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// Steps 2 and 3 — the two-question survey. One component, configured by props:
// the question headline, a supportive sub-line, and the chip options. Selections
// live in the orchestrator (lifted state) so the space picker can seed off Q2.
// Multi-select: any number of chips may be picked; Continue is always enabled
// (an empty answer is valid — this is analytics-shaped, not a hard gate).
//
// Generic on the option type so Q2's SaveKind-typed options/selections flow
// through without a string widening that would lose the literal union.
export function SurveyStep<T extends string>({
  headline,
  support,
  options,
  selected,
  onToggle,
  ctaLabel,
  onAdvance,
}: {
  headline: string;
  support: string;
  options: readonly T[];
  selected: T[];
  onToggle: (option: T) => void;
  ctaLabel: string;
  onAdvance: () => void;
}) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.wrap}>
      <Animated.Text entering={FadeInDown.duration(400)} style={styles.headline}>
        {headline}
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.support}>
        {support}
      </Animated.Text>

      <ScrollView
        style={styles.optionsScroll}
        contentContainerStyle={styles.options}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.chips}>
          {options.map((option) => {
            const active = selected.includes(option);
            return (
              <Pressable
                key={option}
                onPress={() => onToggle(option)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>
                  {option}
                </Text>
                {active && (
                  <Text style={[styles.check, { color: theme.colors.primary }]}>✓</Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <CtaButton label={ctaLabel} onPress={onAdvance} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
  },
  optionsScroll: {
    flex: 1,
  },
  options: {
    paddingVertical: theme.gap(1),
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.gap(1),
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(2),
    borderRadius: 50,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  chipActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  chipLabelActive: {
    color: theme.colors.primaryText,
  },
  check: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
  },
}));
