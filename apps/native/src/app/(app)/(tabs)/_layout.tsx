import { t, useAppLocale } from "@/lib/i18n";
import { NativeTabs } from "expo-router/native-tabs";
import { useUnistyles } from "react-native-unistyles";

// Without an anchor, Expo Router 58 opens the tab with the shortest name (Map).
// eslint-disable-next-line @typescript-eslint/naming-convention -- Expo Router reads this exact export name.
export const unstable_settings = { anchor: "(home)" };

export default function TabsLayout() {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <NativeTabs
      tintColor={theme.colors.tabTint}
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Icon
          sf={{ default: "house", selected: "house.fill" }}
          md="home"
        />
        <NativeTabs.Trigger.Label>
          {t("navigation.home")}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(map)">
        <NativeTabs.Trigger.Icon
          sf={{ default: "map", selected: "map.fill" }}
          md="map"
        />
        <NativeTabs.Trigger.Label>
          {t("navigation.map")}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(trips)">
        <NativeTabs.Trigger.Icon
          sf={{ default: "suitcase", selected: "suitcase.fill" }}
          md="luggage"
        />
        <NativeTabs.Trigger.Label>
          {t("navigation.trips")}
        </NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
