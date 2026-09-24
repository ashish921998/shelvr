import { t, useAppLocale } from "@/lib/i18n";
import { InkDoodle } from "@/components/ink/ink-doodle";
import { INK_A11Y } from "@/components/ink/ink-canvas";
import { PrimaryButton, SecondaryButton } from "@/components/shelf/ink-button";
import { Display, Eyebrow } from "@/components/shelf/typography";
import { EmptyState } from "@/components/empty-state";
import { MasonryFeed } from "@/components/masonry-feed";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { analytics } from "@/lib/analytics";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation } from "convex/react";
import { useLocalSearchParams, useRouter, Stack } from "expo-router";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { StyleSheet } from "react-native-unistyles";

export default function DigestScreen() {
  useAppLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { data: digest, isError } = useQuery(
    convexQuery(api.notifications.getDigest, {
      id: id as Id<"weeklyDigests">,
    }),
  );
  const markOpened = useMutation(api.notifications.markDigestOpened);

  useEffect(() => {
    if (digest && digest.openedAt === undefined) {
      void markOpened({ id: digest._id }).catch((error) => {
        analytics.captureError("mark_digest_opened_failed", error);
      });
    }
  }, [digest, markOpened]);

  if (isError) {
    return (
      <View style={styles.empty}>
        <EmptyState
          title={t("digest.loadFailed")}
          message={t("digest.retryHelp")}
        />
        <SecondaryButton
          label={t("digest.backHome")}
          onPress={() => router.replace("/")}
          style={styles.errorButton}
        />
      </View>
    );
  }

  if (digest === undefined) {
    return <ScreenLoader label={t("loading.digest")} />;
  }

  if (digest === null || digest.items.length === 0) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ title: t("notifications.weeklyShelf") }} />
        <EmptyState
          title={t("digest.emptyTitle")}
          message={t("digest.emptyBody")}
        />
      </View>
    );
  }

  const openNext = () => {
    const first = digest.items[0];
    if (!first) return;
    router.push({
      pathname: "/item/[id]",
      params: { id: first._id, from: "home" },
    });
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: t("notifications.weeklyShelf") }} />
      <MasonryFeed
        items={digest.items}
        numColumns={2}
        source={{ from: "home" }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Eyebrow style={styles.eyebrow}>{t("digest.eyebrow")}</Eyebrow>
            <View style={styles.titleRow}>
              <Display style={styles.title}>{t("digest.title")}</Display>
              {/* The screen's one accent: Sunday, drawn. */}
              <View {...INK_A11Y}>
                <InkDoodle kind="sun" size={44} />
              </View>
            </View>
            <Text style={styles.subtitle}>
              {t("digest.waitingCount", {
                count: digest.itemCount,
              })}
            </Text>
            <PrimaryButton
              label={t("digest.openNext")}
              onPress={openNext}
              style={styles.button}
            />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  empty: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(1),
    gap: theme.gap(0.75),
  },
  eyebrow: { color: theme.colors.primaryText },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { flex: 1 },
  subtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  button: { alignSelf: "flex-start", marginTop: theme.gap(1) },
  errorButton: {
    alignSelf: "center",
    marginBottom: theme.gap(6),
  },
}));
