import { t, useAppLocale } from "@/lib/i18n";
import { InkDoodle } from "@/components/ink/ink-doodle";
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
import { Pressable, Text, View } from "react-native";
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
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/")}
          style={[styles.button, styles.errorButton]}
        >
          <Text style={styles.buttonText}>{t("capture.backToLibrary")}</Text>
        </Pressable>
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
            <Text style={styles.eyebrow}>{t("digest.eyebrow")}</Text>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{t("digest.title")}</Text>
              {/* The screen's one accent: Sunday, drawn. */}
              <InkDoodle kind="sun" size={44} />
            </View>
            <Text style={styles.subtitle}>
              {t("digest.waitingCount", {
                count: digest.itemCount,
              })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={openNext}
              style={({ pressed }) => [
                styles.button,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.buttonText}>{t("digest.openNext")}</Text>
            </Pressable>
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
  eyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 1.2,
    color: theme.colors.primary,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: {
    flex: 1,
    fontFamily: theme.fonts.display,
    fontSize: 30,
    color: theme.colors.foreground,
  },
  subtitle: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  button: {
    alignSelf: "flex-start",
    marginTop: theme.gap(0.5),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.gap(1.75),
    paddingVertical: theme.gap(1),
  },
  buttonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.primaryForeground,
  },
  errorButton: {
    alignSelf: "center",
    marginBottom: theme.gap(6),
  },
}));
