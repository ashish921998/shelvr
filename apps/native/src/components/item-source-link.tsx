import { analytics, type AnalyticsItem } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { displayHost } from "@/lib/url";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import * as WebBrowser from "expo-web-browser";
import {
  Pressable,
  Text,
  type PressableStateCallbackType,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";

type SourceItem = AnalyticsItem & {
  url?: string;
  siteName?: string;
};

export function openItemSource(item: SourceItem): void {
  if (!item.url) return;
  void WebBrowser.openBrowserAsync(item.url)
    .then(() => analytics.itemAction(item, "open_source"))
    .catch(() => {});
}

type Props = {
  item: SourceItem;
  icon?: AppSymbolName;
  iconSize?: number;
  arrowSize?: number;
  iconTintColor: string;
  arrowTintColor: string;
  label?: string;
  style?:
    | StyleProp<ViewStyle>
    | ((state: PressableStateCallbackType) => StyleProp<ViewStyle>);
  textStyle?: StyleProp<TextStyle>;
};

export function ItemSourceLink({
  item,
  icon = "safari",
  iconSize = 13,
  arrowSize = 10,
  iconTintColor,
  arrowTintColor,
  label,
  style,
  textStyle,
}: Props) {
  if (!item.url) return null;
  const site = label ?? item.siteName ?? displayHost(item.url);

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t("item.openSite", { site })}
      hitSlop={6}
      style={style}
      onPress={() => openItemSource(item)}
    >
      <AppSymbolIcon name={icon} size={iconSize} tintColor={iconTintColor} />
      <Text numberOfLines={1} style={textStyle}>
        {site}
      </Text>
      <AppSymbolIcon
        name="arrow.up.right"
        size={arrowSize}
        tintColor={arrowTintColor}
      />
    </Pressable>
  );
}
