import { EmptyState } from "@/components/empty-state";
import { MapPageActions } from "@/components/map/map-page-actions";
import { MapPageCities } from "@/components/map/map-page-cities";
import { MapPageLink } from "@/components/map/map-page-link";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { t, useAppLocale } from "@/lib/i18n";
import { type MapPage, useMapPage } from "@/lib/public-map";
import { backOrHome } from "@/lib/screen-dismiss";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";
import { Platform, ScrollView, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function MapPageBody({ page }: { page: MapPage }) {
  switch (page.status) {
    case "error":
      return (
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      );
    case "loading":
      return <ScreenLoader />;
    case "blocked":
      return (
        <EmptyState
          title={t("publicMap.blockedTitle")}
          message={t("publicMap.blockedBody")}
        />
      );
    case "empty":
      return (
        <EmptyState
          title={t("publicMap.emptyTitle")}
          message={t("publicMap.emptyBody")}
        />
      );
    default:
      return (
        <>
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.content}
          >
            <ThemedText variant="body">
              {t(page.showsBeen ? "publicMap.bodyBeen" : "publicMap.body")}
            </ThemedText>
            <ThemedText variant="footnote" style={styles.muted}>
              {t("publicMap.privacy")}
            </ThemedText>
            {page.url ? <MapPageLink url={page.url} /> : null}
            <MapPageCities
              cities={page.cities}
              disabled={page.busy}
              onToggle={page.toggle}
            />
          </ScrollView>
          <MapPageActions page={page} />
        </>
      );
  }
}

export default function MapPageScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const page = useMapPage(from === "settings" ? "settings" : "map");
  const close = useCallback(() => backOrHome(router), [router]);

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Stack.Screen
        options={{
          title: t("publicMap.title"),
          headerTitleStyle: {
            ...theme.type.title,
            color: theme.colors.foreground,
          },
          ...(Platform.OS === "android"
            ? {
                headerLeft: () => (
                  <HeaderIconButton
                    icon="xmark"
                    label={t("common.close")}
                    onPress={close}
                  />
                ),
              }
            : {}),
        }}
      />
      {Platform.OS === "ios" ? (
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="xmark"
            tintColor={theme.colors.foreground}
            onPress={close}
          >
            {t("common.close")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
      <MapPageBody page={page} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(3),
  },
  muted: { color: theme.colors.muted },
}));
