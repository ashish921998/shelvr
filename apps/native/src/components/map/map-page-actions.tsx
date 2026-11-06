import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import type { MapPage } from "@/lib/public-map";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function TextAction({
  testID,
  label,
  danger = false,
  disabled,
  onPress,
}: {
  testID: string;
  label: string;
  danger?: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      pressRetentionOffset={theme.control.pressRetentionOffset}
      onPress={onPress}
      style={({ pressed }) => [
        styles.textAction,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <ThemedText
        variant="subheadStrong"
        style={danger ? styles.danger : styles.link}
      >
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function MapPageActions({ page }: { page: MapPage }) {
  const on = page.status === "on";
  const sharing = on && !page.edited;
  const title = !on
    ? t("publicMap.create")
    : page.edited
      ? t("publicMap.save")
      : t("publicMap.share");
  return (
    <View style={styles.footer}>
      <Button
        testID="map-page-submit"
        title={title}
        disabled={!page.canSubmit}
        loading={page.busy}
        onPress={() => void (sharing ? page.share() : page.submit())}
      />
      {on ? (
        <View style={styles.textActions}>
          <TextAction
            testID="map-page-new-link"
            label={t("publicMap.newLink")}
            disabled={page.busy}
            onPress={page.rotate}
          />
          <TextAction
            testID="map-page-turn-off"
            label={t("publicMap.turnOff")}
            danger
            disabled={page.busy}
            onPress={page.turnOff}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  footer: {
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
  textActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: theme.gap(4),
  },
  textAction: {
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1),
  },
  link: { color: theme.colors.primaryText },
  danger: { color: theme.colors.danger },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
}));
