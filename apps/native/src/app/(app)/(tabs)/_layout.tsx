import { TabBar } from "@/components/tab-bar";
import { ROOT_TAB } from "@/lib/home-href";
import { t, useAppLocale } from "@/lib/i18n";
import { Tabs } from "expo-router/js-tabs";

// eslint-disable-next-line @typescript-eslint/naming-convention -- Expo Router reads this exact export name.
export const unstable_settings = { anchor: ROOT_TAB };

export default function TabsLayout() {
  useAppLocale();
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <TabBar {...props} />}
    >
      <Tabs.Screen name="(home)" options={{ title: t("navigation.library") }} />
      <Tabs.Screen name="(map)" options={{ title: t("navigation.map") }} />
      <Tabs.Screen name="(trips)" options={{ title: t("navigation.trips") }} />
    </Tabs>
  );
}
