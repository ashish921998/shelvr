import { SignInView } from "@/components/sign-in-view";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { creatorMapListName } from "@/lib/creator-map";
import { t, useAppLocale } from "@/lib/i18n";
import {
  clearPendingCreatorMap,
  getPendingCreatorMap,
  pendingCreatorMapToken,
  setPendingCreatorMap,
  subscribePendingCreatorMap,
} from "@/lib/pending-creator-map";
import { publicMapUrl } from "@/lib/public-map";
import { shareRefOf } from "@/lib/share-link";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Preview = NonNullable<
  FunctionReturnType<typeof api.creatorMaps.creatorMapPreview>
>;
type Outcome = "found" | "empty" | "gone" | "error";

const SHOWN_PLACES = 3;

function openedOutcome(
  isError: boolean,
  data: Preview | null | undefined,
): Outcome | null {
  if (isError) return "error";
  if (data === undefined) return null;
  if (data === null) return "gone";
  return data.placeCount === 0 ? "empty" : "found";
}

function useOpenedOnce(
  token: string,
  outcome: Outcome | null,
  signedIn: boolean,
  places: number,
) {
  const sent = useRef(false);
  useEffect(() => {
    if (outcome === null || sent.current) return;
    sent.current = true;
    void shareRefOf(publicMapUrl(token)).then((shareRef) =>
      analytics.capture("creator_map_opened", {
        signed_in: signedIn,
        outcome,
        places,
        ...(shareRef ? { share_ref: shareRef } : {}),
      }),
    );
  }, [token, outcome, signedIn, places]);
}

export default function CreatorMapScreen() {
  useAppLocale();
  const router = useRouter();
  const params = useLocalSearchParams<{ token: string; city?: string }>();
  const token = params.token ?? "";
  const { isLoading, isAuthenticated } = useConvexAuth();
  const preview = useQuery(
    convexQuery(api.creatorMaps.creatorMapPreview, {
      token,
      city: params.city ?? "",
    }),
  );
  const raw = useSyncExternalStore(
    subscribePendingCreatorMap,
    getPendingCreatorMap,
    getPendingCreatorMap,
  );
  const saving = pendingCreatorMapToken(raw) === token;
  const [signingIn, setSigningIn] = useState(false);
  useOpenedOnce(
    token,
    isLoading ? null : openedOutcome(preview.isError, preview.data),
    isAuthenticated,
    preview.data?.placeCount ?? 0,
  );

  const leave = () => {
    clearPendingCreatorMap();
    if (router.canGoBack()) router.back();
    else router.replace("/(app)/(tabs)/(home)");
  };
  const save = (found: Preview) => {
    analytics.capture("creator_map_save_tapped", {
      signed_in: isAuthenticated,
      places: found.placeCount,
    });
    try {
      setPendingCreatorMap({
        token,
        city: found.city,
        name: creatorMapListName(found.ownerName, found.city),
      });
    } catch (error) {
      analytics.captureError("creator_map_save_failed", error);
      Alert.alert(t("creatorMaps.failed"));
      return;
    }
    if (!isAuthenticated) setSigningIn(true);
  };

  if (signingIn && !isAuthenticated) {
    return (
      <SignInView
        onBack={() => {
          clearPendingCreatorMap();
          setSigningIn(false);
        }}
      />
    );
  }
  if (preview.isError) {
    return (
      <Ended
        title={t("errors.unexpectedTitle")}
        body={t("errors.retrySoon")}
        onLeave={leave}
      />
    );
  }
  if (preview.data === undefined || isLoading) {
    return <ScreenLoader label={t("common.loading")} />;
  }
  if (preview.data === null) {
    return (
      <Ended
        title={t("creatorMaps.deadTitle")}
        body={t("sharedLists.deadBody")}
        onLeave={leave}
      />
    );
  }
  if (preview.data.placeCount === 0) {
    return <Ended title={t("creatorMaps.emptyTitle")} onLeave={leave} />;
  }
  const found = preview.data;
  return (
    <Found
      preview={found}
      saving={saving}
      onSave={() => save(found)}
      onLeave={leave}
    />
  );
}

function Found({
  preview,
  saving,
  onSave,
  onLeave,
}: {
  preview: Preview;
  saving: boolean;
  onSave: () => void;
  onLeave: () => void;
}) {
  const { theme } = useUnistyles();
  const { ownerName, city, placeCount } = preview;
  const placeNames = preview.placeNames.slice(0, SHOWN_PLACES);
  const more = placeCount - placeNames.length;
  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatar}>
          {ownerName ? (
            <ThemedText variant="headline" style={styles.avatarText}>
              {ownerName.slice(0, 1).toLocaleUpperCase()}
            </ThemedText>
          ) : (
            <AppSymbolIcon
              name="person.fill"
              size={26}
              tintColor={theme.colors.surface}
            />
          )}
        </View>
        <ThemedText variant="largeTitle">
          {ownerName
            ? t("creatorMaps.title", { name: ownerName, city })
            : t("creatorMaps.titleNoName", { city })}
        </ThemedText>
        <ThemedText variant="body" style={styles.muted}>
          {ownerName
            ? t("creatorMaps.body", { name: ownerName, city })
            : t("creatorMaps.bodyNoName", { city })}
        </ThemedText>
        <View style={styles.card}>
          <ThemedText variant="title">{city}</ThemedText>
          <ThemedText variant="footnote" style={styles.muted}>
            {t("homePlaces.spotCount", { count: placeCount })}
          </ThemedText>
          {placeNames.map((place, index) => (
            <ThemedText
              key={`${index}:${place}`}
              variant="subheadStrong"
              style={styles.placeName}
            >
              {place}
            </ThemedText>
          ))}
          {more > 0 ? (
            <ThemedText variant="footnote" style={styles.muted}>
              {t("sharedLists.andMore", { count: more })}
            </ThemedText>
          ) : null}
        </View>
        <View style={styles.footer}>
          <ThemedText variant="footnote" style={[styles.muted, styles.center]}>
            {t("creatorMaps.free")}
          </ThemedText>
          <Button
            testID="creator-map-save"
            title={t("creatorMaps.save")}
            loading={saving}
            onPress={onSave}
          />
          <Pressable
            testID="creator-map-not-now"
            accessibilityRole="button"
            onPress={onLeave}
            pressRetentionOffset={theme.control.pressRetentionOffset}
            style={({ pressed }) => [styles.notNow, pressed && styles.pressed]}
          >
            <ThemedText variant="button" style={styles.muted}>
              {t("common.notNow")}
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Ended({
  title,
  body,
  onLeave,
}: {
  title: string;
  body?: string;
  onLeave: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={[styles.content, styles.endedContent]}>
        <ThemedText variant="title" style={styles.center}>
          {title}
        </ThemedText>
        {body ? (
          <ThemedText variant="body" style={[styles.muted, styles.center]}>
            {body}
          </ThemedText>
        ) : null}
        <Button
          testID="creator-map-back-home"
          title={t("sharedLists.backHome")}
          onPress={onLeave}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    gap: theme.gap(2),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(4),
    paddingBottom: theme.gap(3),
  },
  endedContent: { justifyContent: "center", alignItems: "stretch" },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.foreground,
  },
  avatarText: { color: theme.colors.surface },
  card: {
    gap: theme.gap(0.75),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  placeName: { paddingTop: theme.gap(0.5) },
  footer: { marginTop: "auto", gap: theme.gap(1.5) },
  notNow: {
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.gap(1),
  },
  muted: { color: theme.colors.muted },
  center: { textAlign: "center" },
  pressed: { opacity: theme.opacity.pressed },
}));
