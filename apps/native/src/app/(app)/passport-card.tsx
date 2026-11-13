import { EmptyState } from "@/components/empty-state";
import { ShareCard } from "@/components/passport/share-card";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { shareCardOf, usePassport } from "@/lib/passport";
import { backOrHome } from "@/lib/screen-dismiss";
import { Skia } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import {
  type ComponentRef,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Alert,
  findNodeHandle,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function PassportCardScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const { city = "", surface } = useLocalSearchParams<{
    city: string;
    surface?: string;
  }>();
  const { stamps, failed, error } = usePassport();
  useEffect(() => {
    if (error) analytics.captureError("passport_card_load_failed", error);
  }, [error]);
  const card = useRef<ComponentRef<typeof View>>(null);
  const [busy, setBusy] = useState(false);
  const close = useCallback(() => backOrHome(router), [router]);

  const share = async () => {
    const tag = findNodeHandle(card.current);
    if (busy || tag == null || !stamps) return;
    setBusy(true);
    try {
      const image = await Skia.Image.MakeImageFromViewTag(tag);
      if (!image) throw new Error("passport_card_capture_empty");
      const file = new File(Paths.cache, "shelvr-passport.png");
      if (file.exists) file.delete();
      await file.write(image.encodeToBytes());
      analytics.capture("passport_card_share_opened", {
        places: shareCardOf(stamps, city).total,
        surface: surface === "stamp" ? "stamp" : "passport",
      });
      await Sharing.shareAsync(file.uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: t("passport.shareCity", { city }),
      });
    } catch (error) {
      analytics.captureError("passport_card_share_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.tryAgain"));
    } finally {
      setBusy(false);
    }
  };

  const header = (
    <>
      <Stack.Screen
        options={{
          title: city,
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

  if (failed || stamps === undefined) {
    return (
      <View style={styles.screen}>
        {header}
        {failed ? (
          <EmptyState
            title={t("errors.unexpectedTitle")}
            message={t("errors.retrySoon")}
          />
        ) : (
          <ScreenLoader />
        )}
      </View>
    );
  }

  const data = shareCardOf(stamps, city);
  const month =
    data.month === null
      ? null
      : new Date(data.month).toLocaleDateString(formattingLocale(), {
          month: "short",
          year: "numeric",
        });
  const width = Math.min(rt.screen.width - theme.gap(4), 400);

  return (
    <View style={styles.screen}>
      {header}
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <ShareCard
          ref={card}
          city={city}
          total={data.total}
          month={month}
          savedOn={data.savedOn}
          places={data.places}
          width={width}
        />
      </ScrollView>
      <View style={styles.footer}>
        <Button
          testID="passport-card-share"
          title={t("common.share")}
          disabled={data.total === 0}
          loading={busy}
          onPress={() => void share()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.surfaceMuted },
  content: {
    alignItems: "center",
    paddingHorizontal: theme.gap(2),
    paddingVertical: theme.gap(2),
  },
  footer: {
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
}));
