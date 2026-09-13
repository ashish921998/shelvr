import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Step 7 — explain camera and photo-library access without requesting them.
// App Store guidance: ask only when the user chooses capture or import, so the
// system prompt has immediate feature context. This step sets expectations.
export function PermissionsStep({ onAdvance }: { onAdvance: () => void }) {
  useAppLocale();
  const { theme } = useUnistyles();

  return (
    <View style={styles.wrap}>
      <Animated.Text
        entering={FadeInDown.duration(400)}
        style={styles.headline}
      >
        {t("permissions.title")}
      </Animated.Text>

      <Animated.View
        entering={FadeInDown.delay(120).duration(400)}
        style={styles.list}
      >
        <Text style={styles.hint}>{t("permissions.help")}</Text>
        <View style={styles.row}>
          <AppSymbolIcon
            name="camera"
            size={18}
            tintColor={theme.colors.primaryText}
          />
          <View style={styles.copy}>
            <Text style={styles.label}>{t("capture.camera")}</Text>
            <Text style={styles.detail}>{t("permissions.cameraContext")}</Text>
          </View>
        </View>
        <View style={styles.row}>
          <AppSymbolIcon
            name="photo.on.rectangle"
            size={18}
            tintColor={theme.colors.primaryText}
          />
          <View style={styles.copy}>
            <Text style={styles.label}>{t("permissions.photoLibrary")}</Text>
            <Text style={styles.detail}>{t("permissions.photosContext")}</Text>
          </View>
        </View>
      </Animated.View>

      <CtaButton label={t("common.continue")} onPress={onAdvance} />
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
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.gap(1.25),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
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
