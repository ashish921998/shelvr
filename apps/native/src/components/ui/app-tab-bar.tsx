import { useAppLocale } from "@/lib/i18n";
import {
  ShelfTabBar,
  SHELF_TABS,
  TAB_BAR_CLEARANCE,
} from "@/components/ui/shelf-tab-bar";
import { TabList, TabSlot, TabTrigger, Tabs } from "expo-router/ui";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The app's tab bar on every platform: five equal tabs in a floating paper
// pill, with the active one standing on a save card. `ShelfTabBar` draws it;
// this shell only registers the routes with the navigator and reserves the
// room the pill floats over.

export function AppTabs() {
  useAppLocale();
  // `Tabs` is a plain view the Unistyles babel plugin cannot repaint
  // natively, and the render a scheme change triggers still resolves
  // styles.* to the outgoing theme. Reading `theme` here re-renders on the
  // rebuild, and the inline colour hands the view the new value. Without it
  // the backdrop under the bar keeps the outgoing theme's background.
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const restingBottom = Math.max(insets.bottom, 10);

  return (
    <View style={styles.root}>
      <Tabs
        style={[styles.root, { backgroundColor: theme.colors.background }]}
        options={{ backBehavior: "history" }}
      >
        <TabSlot style={[styles.slot, { paddingBottom: TAB_BAR_CLEARANCE }]} />
        {/* Registers the routes; ShelfTabBar draws them. */}
        <TabList style={styles.routeRegistry}>
          {SHELF_TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} />
          ))}
        </TabList>
        <ShelfTabBar restingBottom={restingBottom} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: { flex: 1, backgroundColor: theme.colors.background },
  slot: { flex: 1 },
  // The list itself is never drawn; it exists so the navigator knows the routes.
  routeRegistry: { display: "none" },
}));
