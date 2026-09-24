// ponytail: design exploration only. Three candidate bars for Ashish to pick
// from; the winner replaces ShelfTabBar and this file goes.

import { useMemo } from "react";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { useTabTrigger } from "expo-router/ui";
import { InkIcon } from "@/components/ink/ink-icon";
import { Hairline } from "@/components/ink/hairline";
import { t } from "@/lib/i18n";
import { pressTrigger, SHELF_TABS, tap } from "@/components/ui/shelf-tab-bar";

export type NavVariant = "capsule" | "docked" | "words";

export function NavBarVariant({
  variant,
  restingBottom,
}: {
  variant: NavVariant;
  restingBottom: number;
}) {
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const home = useTabTrigger({ name: SHELF_TABS[0].name });
  const spaces = useTabTrigger({ name: SHELF_TABS[1].name });
  const tidy = useTabTrigger({ name: SHELF_TABS[2].name });
  const map = useTabTrigger({ name: SHELF_TABS[3].name });
  const search = useTabTrigger({ name: SHELF_TABS[4].name });
  const triggers = useMemo(
    () => [home, spaces, tidy, map, search],
    [home, spaces, tidy, map, search],
  );
  const active = Math.max(
    0,
    triggers.findIndex((trigger) => trigger.triggerProps.isFocused),
  );

  const tabs = SHELF_TABS.map((tab, index) => {
    const on = index === active;
    const color = on ? theme.colors.foreground : theme.colors.muted;
    const label = t(tab.label);
    const onPress = () => {
      tap();
      pressTrigger(triggers[index]);
    };
    const a11y = {
      testID: tab.testID,
      accessibilityRole: "tab" as const,
      accessibilityState: { selected: on },
      accessibilityLabel: label,
    };

    if (variant === "words") {
      return (
        <Pressable
          key={tab.name}
          style={styles.wordTab}
          onPress={onPress}
          {...a11y}
        >
          <Text style={[styles.word, on && styles.wordOn]}>{label}</Text>
          <View style={styles.wordLine}>
            {on ? (
              <Hairline key={`line-${index}`} width={72} seed={index} />
            ) : null}
          </View>
        </Pressable>
      );
    }

    return (
      <Pressable
        key={tab.name}
        style={variant === "capsule" ? styles.capsuleTab : styles.dockedTab}
        onPress={onPress}
        {...a11y}
      >
        <View
          style={[
            styles.iconWrap,
            variant === "capsule" && on && styles.capsuleOn,
          ]}
        >
          {/* Keyed so the active icon inks itself in again on arrival. */}
          <InkIcon
            key={on ? `on-${index}` : `off-${index}`}
            name={tab.icon}
            size={22}
            tint={color}
            seed={index}
            opacity={on ? 0.95 : 0.6}
          />
        </View>
        <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
          {label}
        </Text>
        {variant === "docked" ? (
          <View style={styles.dockLine}>
            {on ? (
              <Hairline key={`line-${index}`} width={64} seed={index} />
            ) : null}
          </View>
        ) : null}
      </Pressable>
    );
  });

  if (variant === "capsule") {
    return (
      <View
        style={[styles.floatWrap, { bottom: restingBottom + 8 }]}
        pointerEvents="box-none"
      >
        <View style={styles.capsuleBar}>{tabs}</View>
      </View>
    );
  }

  return (
    <View style={[styles.dock, { paddingBottom: restingBottom }]}>
      <Hairline width={width} seed={7} style={styles.dockRule} />
      <View style={variant === "words" ? styles.wordRow : styles.dockRow}>
        {tabs}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  // A: slim floating capsule, every tab labelled, the active one on a soft
  // paper chip.
  floatWrap: { position: "absolute", left: 16, right: 16 },
  capsuleBar: {
    flexDirection: "row",
    backgroundColor: theme.colors.surface,
    borderRadius: 32,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 6,
    paddingHorizontal: 6,
    boxShadow: "0 6px 20px rgba(43, 36, 24, 0.10)",
  },
  capsuleTab: { flex: 1, alignItems: "center", gap: 2, paddingVertical: 2 },
  capsuleOn: { backgroundColor: theme.colors.primarySoft },
  iconWrap: {
    width: 52,
    height: 30,
    borderRadius: 15,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    color: theme.colors.muted,
  },
  labelOn: { fontFamily: theme.fonts.bold, color: theme.colors.foreground },

  // B: docked to the page, a drawn rule across the top, the active tab
  // underlined by hand in ochre.
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: theme.colors.background,
  },
  dockRule: { marginTop: -8 },
  dockRow: { flexDirection: "row", paddingTop: 2 },
  dockedTab: { flex: 1, alignItems: "center", gap: 2, paddingTop: 2 },
  dockLine: { height: 16, marginTop: -4 },

  // C: words only, set in the display face, like the contents line of a
  // printed page.
  wordRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  wordTab: { alignItems: "center", paddingVertical: 4 },
  word: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.muted,
  },
  wordOn: { color: theme.colors.foreground },
  wordLine: { height: 16, marginTop: -2 },
}));
