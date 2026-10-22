import { openItemSource } from "@/components/item-source-link";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";
import { displayHost, isYouTubeVideoUrl, siteMonogram } from "@/lib/url";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type SiteItem = Parameters<typeof openItemSource>[0];

export function SitePanel({ url }: { url?: string }) {
  const { theme } = useUnistyles();
  const monogram = siteMonogram(url);
  return (
    <View collapsable={false} style={styles.sitePanel}>
      <View style={styles.siteDisc}>
        {monogram === undefined ? (
          <AppSymbolIcon
            name="link"
            size={24}
            tintColor={theme.colors.primaryText}
          />
        ) : (
          <Text
            style={styles.siteLetter}
            maxFontSizeMultiplier={1}
            accessible={false}
          >
            {monogram}
          </Text>
        )}
      </View>
      <Text style={styles.siteHost} numberOfLines={1}>
        {displayHost(url)}
      </Text>
    </View>
  );
}

export function SiteButton({ item }: { item: SiteItem }) {
  const site = item.siteName ?? displayHost(item.url);
  return (
    <Button
      title={
        isYouTubeVideoUrl(item.url)
          ? t("item.watchOnSite", { site })
          : t("item.viewOnSite", { site })
      }
      onPress={() => {
        openItemSource(item);
      }}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  sitePanel: {
    height: 170,
    marginHorizontal: theme.gap(2),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  siteDisc: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  siteLetter: {
    fontFamily: theme.fonts.display,
    fontSize: 30,
    lineHeight: 36,
    color: theme.colors.primaryText,
  },
  siteHost: {
    position: "absolute",
    bottom: theme.gap(1.5),
    left: theme.gap(2),
    right: theme.gap(2),
    textAlign: "center",
    ...theme.type.badge,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
}));
