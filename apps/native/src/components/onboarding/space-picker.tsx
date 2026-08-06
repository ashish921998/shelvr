import { CtaButton } from '@/components/onboarding/parts';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// The closed set of Q2 ("What do you save most?") answers. The picker maps each
// to one or more starter space names so a user who picked "Recipes" lands here
// with "Recipes" and "Restaurants to try" already selected.
export type SaveKind =
  | 'Articles'
  | 'Recipes'
  | 'Products'
  | 'Home & decor'
  | 'Travel'
  | 'Fitness'
  | 'Inspiration'
  | 'Videos';

// Static preset map — no backend, no config. Every Q2 answer seeds a focused
// starter set; generic presets below catch everyone. Deduped at render time so
// overlapping answers (e.g. Inspiration + Travel) don't double-list a space.
const SPACE_PRESETS: Record<SaveKind, string[]> = {
  Articles: ['Articles', 'Read later', 'Long reads'],
  Recipes: ['Recipes', 'Restaurants to try'],
  Products: ['Wishlist', 'Gift ideas'],
  'Home & decor': ['Home', 'Decor ideas'],
  Travel: ['Travel', 'Trip ideas'],
  Fitness: ['Fitness', 'Workouts'],
  Inspiration: ['Inspiration', 'Ideas'],
  Videos: ['Videos', 'Watch later'],
};

// Always offered, regardless of Q2 — these are the universally useful shelves.
const GENERIC_PRESETS = ['Read later', 'Inspiration', 'Wishlist'];

/**
 * Step 4 — pick your spaces. Chips are pre-selected from Q2, then editable
 * (toggle, min 1). The chosen names flow to step 5 which calls `createSpace`
 * per name. This is the only step that produces real persisted state before the
 * final `completeOnboarding()`.
 */
export function SpacePickerStep({
  answers,
  selected,
  onToggle,
  onAdvance,
}: {
  answers: SaveKind[];
  selected: string[];
  onToggle: (name: string) => void;
  onAdvance: () => void;
}) {
  const { theme } = useUnistyles();

  // Build the deduped candidate list: seeded presets from each Q2 answer, then
  // generics, preserving first-seen order.
  const seen = new Set<string>();
  const candidates: string[] = [];
  for (const kind of answers) {
    for (const name of SPACE_PRESETS[kind] ?? []) {
      if (!seen.has(name)) {
        seen.add(name);
        candidates.push(name);
      }
    }
  }
  for (const name of GENERIC_PRESETS) {
    if (!seen.has(name)) {
      seen.add(name);
      candidates.push(name);
    }
  }

  // Anything pre-selected that isn't a known preset (e.g. carried over from an
  // earlier render) still shows so the user can deselect it.
  for (const name of selected) {
    if (!seen.has(name)) {
      candidates.push(name);
      seen.add(name);
    }
  }

  const canAdvance = selected.length >= 1;

  return (
    <View style={styles.wrap}>
      <Animated.Text entering={FadeInDown.duration(400)} style={styles.headline}>
        Pick your spaces.
      </Animated.Text>
      <Animated.Text entering={FadeInDown.delay(80).duration(400)} style={styles.support}>
        Shelvr files every save into these automatically. Add or rename anytime.
      </Animated.Text>

      <ScrollView
        style={styles.optionsScroll}
        contentContainerStyle={styles.options}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.chips}>
          {candidates.map((name) => {
            const active = selected.includes(name);
            return (
              <Pressable
                key={name}
                onPress={() => onToggle(name)}
                style={({ pressed }) => [
                  styles.chip,
                  active && styles.chipActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{name}</Text>
                {active && <Text style={[styles.check, { color: theme.colors.primary }]}>✓</Text>}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <CtaButton label="Create my spaces" onPress={onAdvance} disabled={!canAdvance} />
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
