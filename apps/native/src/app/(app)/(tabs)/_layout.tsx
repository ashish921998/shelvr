import { TabBar } from "@/components/tab-bar";
import { t, useAppLocale } from "@/lib/i18n";
import { Tabs } from "expo-router/js-tabs";

// Without an anchor, Expo Router 58 opens the tab with the shortest name (Map).
// eslint-disable-next-line @typescript-eslint/naming-convention -- Expo Router reads this exact export name.
export const unstable_settings = { anchor: "(home)" };

export default function TabsLayout() {
  useAppLocale();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="(home)" options={{ title: t("navigation.home") }} />
      <Tabs.Screen name="(map)" options={{ title: t("navigation.map") }} />
      <Tabs.Screen name="(trips)" options={{ title: t("navigation.trips") }} />
    </Tabs>
  );
}
