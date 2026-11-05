import { TabBar } from "@/components/tab-bar";
import { t, useAppLocale } from "@/lib/i18n";
import { Tabs } from "expo-router/js-tabs";

// The tab a link opens when it names none. A plain launch reaches the Map through +native-intent.
// eslint-disable-next-line @typescript-eslint/naming-convention -- Expo Router reads this exact export name.
export const unstable_settings = { anchor: "(map)" };

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
