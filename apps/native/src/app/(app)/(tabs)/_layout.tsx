import { t, useAppLocale } from "@/lib/i18n";
import { AppTabs } from "@/components/ui/app-tab-bar";
import { NativeTabs } from "expo-router/native-tabs";
import { Platform } from "react-native";
import { useUnistyles } from "react-native-unistyles";

// Without an anchor, Expo Router 58 opens the tab with the shortest name (Map).
// eslint-disable-next-line @typescript-eslint/naming-convention -- Expo Router reads this exact export name.
export const unstable_settings = { anchor: "(home)" };

export default function TabsLayout() {
  useAppLocale();
  const { theme } = useUnistyles();
  if (Platform.OS === "ios") {
    return (
      <NativeTabs
        tintColor={theme.colors.tabTint}
        minimizeBehavior="onScrollDown"
      >
        <NativeTabs.Trigger name="(home)">
          <NativeTabs.Trigger.Icon
            sf={{
              default: "square.grid.2x2",
              selected: "square.grid.2x2.fill",
            }}
          />
          <NativeTabs.Trigger.Label>
            {t("navigation.home")}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(map)">
          <NativeTabs.Trigger.Icon
            sf={{ default: "map", selected: "map.fill" }}
          />
          <NativeTabs.Trigger.Label>
            {t("navigation.map")}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return <AppTabs />;
}
