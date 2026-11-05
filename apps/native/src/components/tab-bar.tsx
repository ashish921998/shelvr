import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { withAlpha } from "@/lib/color";
import { useSaveGuard } from "@/lib/free-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { useKeyboardVisible } from "@/lib/use-keyboard-visible";
import { useRouter } from "expo-router";
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from "expo-router/js-tabs";
import { useContext, useEffect } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type TabRoute = BottomTabBarProps["state"]["routes"][number];

const TAB_EMOJI: Record<string, string> = {
  "(home)": "🏠",
  "(map)": "🗺️",
  "(trips)": "🧳",
};

function TabButton({
  route,
  label,
  onPress,
}: {
  route: TabRoute | undefined;
  label: string;
  onPress: () => void;
}) {
  if (!route) return <View style={styles.side} />;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.side, pressed && styles.pressed]}
    >
      <Text style={styles.emoji} allowFontScaling={false}>
        {TAB_EMOJI[route.name]}
      </Text>
      <ThemedText variant="caption" numberOfLines={1} style={styles.label}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function TabBar({
  state,
  descriptors,
  emitter,
  navigateToTab,
}: BottomTabBarProps) {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { guard, loading } = useSaveGuard("tab_bar");
  const keyboardVisible = useKeyboardVisible();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const hidden = Platform.OS === "android" && keyboardVisible;
  useEffect(() => {
    if (hidden) onHeightChange?.(0);
  }, [hidden, onHeightChange]);
  if (hidden) return null;
  const current = state.routes[state.index];
  const [left, right] = state.routes.filter(
    (route) => route.key !== current?.key,
  );
  const label = (route: TabRoute | undefined) =>
    route ? (descriptors[route.key]?.options.title ?? route.name) : "";
  const open = (route: TabRoute | undefined) => () => {
    if (!route) return;
    const event = emitter.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) navigateToTab(route.key);
  };
  return (
    <View
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[
        styles.bar,
        {
          experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(theme.colors.background, 0)} 0%, ${withAlpha(theme.colors.background, 0.85)} 35%, ${theme.colors.background} 60%)`,
        },
      ]}
    >
      <TabButton route={left} label={label(left)} onPress={open(left)} />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.add")}
        onPress={() => {
          if (!loading) void guard(() => router.push("/add"));
        }}
        style={({ pressed }) => [styles.add, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name="plus"
          size={28}
          weight="semibold"
          tintColor={theme.colors.tabTint}
        />
      </Pressable>
      <TabButton route={right} label={label(right)} onPress={open(right)} />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "flex-start",
    gap: theme.gap(1.5),
    paddingTop: theme.gap(1),
    paddingBottom: Math.max(rt.insets.bottom, theme.gap(1.5)),
  },
  side: {
    width: 96,
    alignItems: "center",
    gap: theme.gap(0.25),
    paddingTop: theme.gap(1.25),
  },
  emoji: { fontSize: 34, lineHeight: 42 },
  label: { color: theme.colors.muted },
  add: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 32,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
  },
  pressed: { opacity: theme.opacity.pressed },
}));
