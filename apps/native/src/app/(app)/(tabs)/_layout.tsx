import { t, useAppLocale } from "@/lib/i18n";
import { AppTabs } from "@/components/ui/app-tab-bar";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { DynamicColorIOS, Platform, type ColorValue } from "react-native";

const tint: ColorValue =
  Platform.OS === "ios"
    ? DynamicColorIOS({ light: "#c98a24", dark: "#e6a23c" })
    : "#e6a23c";

export default function TabsLayout() {
  useAppLocale();
  if (Platform.OS === "ios") {
    return (
      <NativeTabs tintColor={tint} minimizeBehavior="onScrollDown">
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
