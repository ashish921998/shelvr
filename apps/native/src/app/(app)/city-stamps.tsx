import { EmptyState } from "@/components/empty-state";
import { CityStampGrid } from "@/components/passport/city-stamp-grid";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { stampedCityIds, useCityStamps } from "@/lib/city-stamp-data";
import { useCityStampToggle } from "@/lib/city-stamps";
import { t, useAppLocale } from "@/lib/i18n";
import type { SampleCityId } from "@/lib/sample-cities";
import { Stack } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function CityStampsEditor({ ids }: { ids: SampleCityId[] }) {
  const toggle = useCityStampToggle();
  return (
    <View style={styles.content}>
      <CityStampGrid
        header={<Text style={styles.body}>{t("cityStamps.body")}</Text>}
        picked={ids}
        onToggle={(city) => {
          const stamped = !ids.includes(city);
          void toggle(city, stamped, ids.length + (stamped ? 1 : -1));
        }}
      />
    </View>
  );
}

export default function CityStampsScreen() {
  useAppLocale();
  const { theme } = useUnistyles();
  const { stamps, error } = useCityStamps();
  useEffect(() => {
    if (error) analytics.captureError("city_stamps_load_failed", error);
  }, [error]);

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: t("cityStamps.title"),
          headerTransparent: false,
          headerStyle: { backgroundColor: theme.colors.background },
          headerTitleStyle: {
            ...theme.type.title,
            color: theme.colors.foreground,
          },
        }}
      />
      {error ? (
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      ) : stamps === undefined ? (
        <ScreenLoader />
      ) : (
        <CityStampsEditor ids={stampedCityIds(stamps)} />
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
