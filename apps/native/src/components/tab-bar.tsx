import { AppSymbolIcon } from "@/components/symbol";
import { withAlpha } from "@/lib/color";
import { t, useAppLocale } from "@/lib/i18n";
import { useMapCityInView } from "@/lib/map-city-in-view";
import { usePlanPicker } from "@/lib/plan-picker";
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

const LIBRARY = "(home)";
const MAP = "(map)";
const TAB_EMOJI: Record<string, string> = { [LIBRARY]: "📘", [MAP]: "🗺️" };
const ADD_SIZE = 64;
const ADD_LIFT = 8;

export function addButtonBottom(insetBottom: number): number {
  return Math.max(insetBottom, 12) + ADD_LIFT;
}

export function AddButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: "plus" | "xmark";
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.add, pressed && styles.pressed]}
    >
      <AppSymbolIcon
        name={icon}
        size={icon === "plus" ? 27 : 22}
        weight="bold"
        tintColor={theme.colors.foreground}
      />
    </Pressable>
  );
}

function TabItem({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.pressed]}
    >
      <Text style={styles.emoji} allowFontScaling={false}>
        {emoji}
      </Text>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
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
  const keyboardVisible = useKeyboardVisible();
  const onHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const cityInView = useMapCityInView();
  const planner = usePlanPicker();
  const hidden = Platform.OS === "android" && keyboardVisible;
  useEffect(() => {
    if (hidden) onHeightChange?.(0);
  }, [hidden, onHeightChange]);
  if (hidden) return null;
  const current = state.routes[state.index];
  const onMap = current?.name === MAP;
  const other = state.routes.find(
    (route) => route.name === (current?.name === LIBRARY ? MAP : LIBRARY),
  );
  const open = (route: TabRoute) => () => {
    const event = emitter.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!event.defaultPrevented) navigateToTab(route.key);
  };
  const background = theme.colors.background;
  const strength = onMap ? 0.96 : 1;
  return (
    <View
      onLayout={(event) => onHeightChange?.(event.nativeEvent.layout.height)}
      style={[
        styles.bar,
        {
          experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(background, 0)} 0%, ${withAlpha(background, 0.85 * strength)} 35%, ${withAlpha(background, 0.97 * strength)} 55%, ${withAlpha(background, strength)} 75%)`,
        },
      ]}
    >
      {other ? (
        <TabItem
          emoji={TAB_EMOJI[other.name] ?? ""}
          label={descriptors[other.key]?.options.title ?? other.name}
          onPress={open(other)}
        />
      ) : (
        <View style={styles.item} />
      )}
      <View style={styles.lift}>
        <AddButton
          label={t("common.add")}
          icon="plus"
          onPress={() => router.push("/add-spots")}
        />
      </View>
      <TabItem
        emoji="🎲"
        label={t("homePlaces.planDate")}
        onPress={() => planner.plan("date", onMap ? cityInView : undefined)}
      />
      {planner.sheet}
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
    alignItems: "flex-end",
    paddingTop: theme.gap(2),
    paddingBottom: Math.max(rt.insets.bottom, 12),
  },
  item: {
    width: 100,
    alignItems: "center",
    gap: 5,
  },
  emoji: { fontSize: 38, lineHeight: 44 },
  label: {
    fontFamily: theme.fonts.regular,
    fontSize: 10.5,
    lineHeight: 13,
    color: theme.colors.muted,
  },
  lift: { marginBottom: ADD_LIFT },
  add: {
    width: ADD_SIZE,
    height: ADD_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: ADD_SIZE / 2,
    borderWidth: 0.5,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.frame,
    boxShadow: "0 4px 14px rgba(43, 36, 24, 0.18)",
  },
  pressed: { opacity: theme.opacity.pressed },
}));
