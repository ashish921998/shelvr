import { BeenCityGrid } from "@/components/been/been-city-grid";
import { EmptyState } from "@/components/empty-state";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { useBeenCities, useBeenCityToggle } from "@/lib/been-cities";
import { t, useAppLocale } from "@/lib/i18n";
import type { SampleCityId } from "@/lib/sample-cities";
import { backOrHome } from "@/lib/screen-dismiss";
import { Stack, useRouter } from "expo-router";
import { useCallback } from "react";
import { Platform, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function BeenCitiesEditor({ ids }: { ids: SampleCityId[] }) {
  const toggle = useBeenCityToggle();
  return (
    <View style={styles.content}>
      <BeenCityGrid
        header={<Text style={styles.body}>{t("been.editorBody")}</Text>}
        picked={ids}
        onToggle={(city) => {
          const been = !ids.includes(city);
          toggle(city, been, ids.length + (been ? 1 : -1));
        }}
      />
    </View>
  );
}

export default function BeenCitiesScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { ids, error } = useBeenCities();
  const close = useCallback(() => backOrHome(router), [router]);

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Stack.Screen
        options={{
          title: t("been.citiesTitle"),
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
      {error ? (
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      ) : ids === undefined ? (
        <ScreenLoader />
      ) : (
        <BeenCitiesEditor ids={ids} />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flex: 1,
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(2),
    paddingBottom: rt.insets.bottom,
  },
  body: {
    ...theme.type.subhead,
    color: theme.colors.muted,
  },
}));
