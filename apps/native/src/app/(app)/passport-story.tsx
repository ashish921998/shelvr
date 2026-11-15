import { EmptyState } from "@/components/empty-state";
import { PassportStoryCard } from "@/components/passport/passport-story-card";
import { Button } from "@/components/ui/button";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { cityStampLabel, useCityStamps } from "@/lib/city-stamp-data";
import { t, useAppLocale } from "@/lib/i18n";
import { usePassport } from "@/lib/passport";
import {
  usePassportShare,
  useSharePassport,
  passportUrl,
} from "@/lib/passport-share";
import { passportStoryOf, usePassportTogether } from "@/lib/passport-story";
import { backOrHome } from "@/lib/screen-dismiss";
import { webUrl } from "@/lib/web-url";
import { api } from "@convex/_generated/api";
import { Skia } from "@shopify/react-native-skia";
import { useMutation } from "convex/react";
import { File, Paths } from "expo-file-system";
import { Stack, useRouter } from "expo-router";
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
  PixelRatio,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { ScopedTheme, StyleSheet, useUnistyles } from "react-native-unistyles";

const PREVIEW_CHROME = 300;
const EXPORT_PIXELS = 1080;

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function Header({ onClose }: { onClose: () => void }) {
  const { theme } = useUnistyles();
  return (
    <>
      <Stack.Screen
        options={{
          title: t("passportStory.screenTitle"),
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
                    onPress={onClose}
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
            onPress={onClose}
          >
            {t("common.close")}
          </Stack.Toolbar.Button>
        </Stack.Toolbar>
      ) : null}
    </>
  );
}

async function captureCard(tag: number): Promise<string> {
  const image = await Skia.Image.MakeImageFromViewTag(tag);
  if (!image) throw new Error("passport_story_capture_empty");
  const file = new File(Paths.cache, "shelvr-passport-story.png");
  if (file.exists) file.delete();
  await file.write(image.encodeToBytes());
  return file.uri;
}

export default function PassportStoryScreen() {
  useAppLocale();
  const router = useRouter();
  const { theme, rt } = useUnistyles();
  const { stamps, failed, error } = usePassport();
  const cityStamps = useCityStamps();
  const together = usePassportTogether() ?? 0;
  const existing = usePassportShare();
  const mint = useMutation(api.passportShares.sharePassport);
  const linkShare = useSharePassport(stamps?.length ?? 0);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const card = useRef<ComponentRef<typeof View>>(null);
  const close = useCallback(() => backOrHome(router), [router]);
  useEffect(() => {
    if (error) analytics.captureError("passport_story_load_failed", error);
  }, [error]);

  const live = token ?? existing;
  const link = live === null ? webUrl("/") : passportUrl(live);

  const share = async () => {
    if (busy || !stamps) return;
    setBusy(true);
    try {
      if (live === null) {
        setToken(await mint({}));
        await nextFrame();
      }
      const tag = findNodeHandle(card.current);
      if (tag == null) throw new Error("passport_story_card_missing");
      const uri = await captureCard(tag);
      analytics.capture("passport_story_share_opened", {
        places: stamps.length,
        together,
      });
      await Sharing.shareAsync(uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: t("passportShare.share"),
      });
    } catch (shareError) {
      analytics.captureError("passport_story_share_failed", shareError);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.tryAgain"));
    } finally {
      setBusy(false);
    }
  };

  if (failed || stamps === undefined) {
    return (
      <View style={styles.screen}>
        <Header onClose={close} />
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

  const story = passportStoryOf(
    stamps,
    cityStamps.stamps ?? [],
    cityStampLabel,
  );
  const fitHeight =
    rt.screen.height - rt.insets.top - rt.insets.bottom - PREVIEW_CHROME;
  const width = Math.min(
    rt.screen.width - theme.gap(4),
    400,
    Math.floor((fitHeight * 9) / 16),
  );
  const exportWidth = Math.min(
    rt.screen.width,
    EXPORT_PIXELS / PixelRatio.get(),
  );
  const cardProps = {
    story,
    together,
    link,
    year: String(new Date().getFullYear()),
  };

  return (
    <View style={styles.screen}>
      <Header onClose={close} />
      <View
        style={styles.capture}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <ScopedTheme name="light">
          <PassportStoryCard ref={card} {...cardProps} width={exportWidth} />
        </ScopedTheme>
      </View>
      <ScrollView
        style={styles.scroll}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <ScopedTheme name="light">
          <PassportStoryCard {...cardProps} width={width} />
        </ScopedTheme>
        <Text style={styles.note}>{t("passportStory.linkNote")}</Text>
      </ScrollView>
      <View style={styles.footer}>
        <Button
          testID="passport-story-share"
          title={t("common.share")}
          disabled={story.places === 0}
          loading={busy}
          onPress={() => void share()}
        />
        <Pressable
          testID="passport-story-share-link"
          accessibilityRole="button"
          disabled={linkShare.busy}
          onPress={() => void linkShare.share()}
          style={({ pressed }) => [
            styles.linkButton,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.linkText}>{t("passportStory.shareLink")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.surfaceMuted },
  capture: { position: "absolute", top: 0, left: 0 },
  scroll: { flex: 1, backgroundColor: theme.colors.surfaceMuted },
  content: {
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingVertical: theme.gap(2),
  },
  note: {
    ...theme.type.footnote,
    color: theme.colors.muted,
    textAlign: "center",
    maxWidth: 400,
  },
  linkButton: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: theme.control.minHeight,
  },
  linkText: { ...theme.type.bodyLabel, color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
  footer: {
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.background,
  },
}));
