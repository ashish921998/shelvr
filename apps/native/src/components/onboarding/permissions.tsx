import { CtaButton } from '@/components/onboarding/parts';
import { AppSymbolIcon } from '@/components/symbol';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// Step 7 — explain camera and photo-library access without requesting them.
// App Store guidance: ask only when the user chooses capture or import, so the
// system prompt has immediate feature context. This step sets expectations.
export function PermissionsStep({ onAdvance }: { onAdvance: () => void }) {
  const { theme } = useUnistyles();

  return (
    <View style={styles.wrap}>
      <Animated.Text entering={FadeInDown.duration(400)} style={styles.headline}>
        Access when you need it.
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.list}>
        <Text style={styles.hint}>
          Shelvr only asks for permissions when you use the matching feature.
        </Text>
        <View style={styles.row}>
          <AppSymbolIcon name="camera" size={18} tintColor={theme.colors.primaryText} />
          <View style={styles.copy}>
            <Text style={styles.label}>Camera</Text>
            <Text style={styles.detail}>When you capture something to save.</Text>
          </View>
        </View>
        <View style={styles.row}>
          <AppSymbolIcon name="photo.on.rectangle" size={18} tintColor={theme.colors.primaryText} />
          <View style={styles.copy}>
            <Text style={styles.label}>Photo Library</Text>
            <Text style={styles.detail}>When you import a photo or run Tidy.</Text>
          </View>
        </View>
      </Animated.View>

      <CtaButton label="Continue" onPress={onAdvance} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(3),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  list: {
    gap: theme.gap(1.5),
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.faint,
    marginBottom: theme.gap(0.5),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.gap(1.25),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  copy: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  detail: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
}));
