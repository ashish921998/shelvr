import { GlassView as ExpoGlassView } from 'expo-glass-effect';
import { Platform, View } from 'react-native';
import type { ViewProps } from 'react-native';

/**
 * Cross-platform glass surface.
 *
 * On iOS, renders expo-glass-effect's GlassView (liquid glass material).
 * On Android, renders a plain View with a semi-transparent surface
 * background, since the native liquid glass API is iOS-only.
 *
 * Drop-in: accepts the same props as GlassView plus a `fallbackStyle`
 * to customize the Android background.
 */
type GlassViewProps = React.ComponentProps<typeof ExpoGlassView>;

export function GlassView({
  style,
  fallbackStyle,
  children,
  ...props
}: GlassViewProps & { fallbackStyle?: ViewProps['style'] }) {
  if (Platform.OS === 'ios') {
    return (
      <ExpoGlassView style={style} {...props}>
        {children}
      </ExpoGlassView>
    );
  }

  // Android: no liquid glass. Use a surface-toned semi-transparent background
  // so the element is still visible and tappable without the glass material.
  return (
    <View
      style={[
        style,
        { backgroundColor: 'rgba(255, 255, 255, 0.12)' },
        fallbackStyle,
      ]}
    >
      {children}
    </View>
  );
}
