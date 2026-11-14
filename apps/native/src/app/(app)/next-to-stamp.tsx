import { EmptyState } from "@/components/empty-state";
import { NextToStampList } from "@/components/passport/next-to-stamp";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import {
  completionFor,
  type UnstampedPlace,
  useCityCompletion,
} from "@/lib/passport";
import { backOrHome } from "@/lib/screen-dismiss";
import { cityStampPlace } from "@/lib/stamp-moment";
import { usePlaceVisit } from "@/lib/use-place-visit";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { Platform, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function NextToStampScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { city: param } = useLocalSearchParams<{ city: string }>();
  const places = useQuery(
    convexQuery(api.placeVisits.listUnstampedPlacesInCity, {
      city: param ?? "",
    }),
  );
  const completion = useCityCompletion();
  const row = completionFor(completion.rows, param ?? "");
  const city = row?.city ?? param ?? "";
  const visit = usePlaceVisit("next_to_stamp");
  const close = useCallback(() => backOrHome(router), [router]);
  const active = useRef(true);
  useEffect(
    () => () => {
      active.current = false;
    },
    [],
  );
  useEffect(() => {
    if (places.error) {
      analytics.captureError("passport_next_load_failed", places.error);
    }
  }, [places.error]);

  const stamp = async (place: UnstampedPlace) => {
    const { itemId, name, spot } = place;
    const done = await visit.toggle(
      itemId,
      { name, ...spot },
      true,
      cityStampPlace(city, place.cover, row),
    );
    if (done && active.current) router.dismissTo("/(app)/(tabs)/(passport)");
  };

  const header = (
    <>
      <Stack.Screen
        options={{
          title: t("passport.nextTitle"),
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
    </>
  );

  return (
    <View style={styles.screen} accessibilityViewIsModal>
      {header}
      {places.isError ? (
        <EmptyState
          title={t("errors.unexpectedTitle")}
          message={t("errors.retrySoon")}
        />
      ) : places.data === undefined ? (
        <ScreenLoader />
      ) : (
        <NextToStampList
          city={city}
          places={places.data}
          completion={row}
          busy={visit.busy}
          onStamp={(place) => void stamp(place)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
}));
