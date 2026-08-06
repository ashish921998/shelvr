import { CtaButton, PermissionButton } from '@/components/onboarding/parts';
import * as ImagePicker from 'expo-image-picker';
import { Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StyleSheet } from 'react-native-unistyles';
import { useCameraPermission } from 'react-native-vision-camera';

// Step 7 — the two permissions, now their own step. Identical to v1 (same
// PermissionButton rows, same hint copy) but detached from the promise screen.
// Continue is enabled regardless of grant state — permissions are opt-in.
export function PermissionsStep({ onAdvance }: { onAdvance: () => void }) {
  const { hasPermission: cameraGranted, requestPermission: requestCamera } =
    useCameraPermission();
  const [libraryPermission, requestLibrary] = ImagePicker.useMediaLibraryPermissions();

  return (
    <View style={styles.wrap}>
      <Animated.Text entering={FadeInDown.duration(400)} style={styles.headline}>
        Two quick permissions.
      </Animated.Text>

      <Animated.View entering={FadeInDown.delay(120).duration(400)} style={styles.permissions}>
        <Text style={styles.hint}>
          Shelvr works best with a couple of permissions — you stay in control.
        </Text>
        <PermissionButton
          icon="camera"
          label="Camera"
          granted={cameraGranted}
          onPress={requestCamera}
        />
        <PermissionButton
          icon="photo.on.rectangle"
          label="Photo Library"
          granted={libraryPermission?.granted ?? false}
          onPress={requestLibrary}
        />
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
  permissions: {
    gap: theme.gap(1),
  },
  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.faint,
    marginBottom: theme.gap(0.5),
  },
}));
