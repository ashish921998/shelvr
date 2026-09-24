import { t, useAppLocale } from "@/lib/i18n";
import { AppTabs } from "@/components/ui/app-tab-bar";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { Platform } from "react-native";
import { useUnistyles } from "react-native-unistyles";

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
        <NativeTabs.Trigger name="(spaces)">
          <NativeTabs.Trigger.Icon
            sf={{
              default: "rectangle.stack",
              selected: "rectangle.stack.fill",
            }}
          />
          <NativeTabs.Trigger.Label>
            {t("navigation.spaces")}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="(tidy)">
          <NativeTabs.Trigger.Icon
            sf={{ default: "photo.stack", selected: "photo.stack.fill" }}
          />
          <NativeTabs.Trigger.Label>
            {t("navigation.tidy")}
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
        <NativeTabs.Trigger name="(search)" role="search">
          <NativeTabs.Trigger.Label>
            {t("navigation.search")}
          </NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
    );
  }

  return <AppTabs />;
}
