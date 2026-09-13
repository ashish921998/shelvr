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
          title="Couldn’t load your weekly shelf"
          message="Check your connection and try opening it again."
        />
        <Pressable
          accessibilityRole="button"
          onPress={() => router.replace("/")}
          style={[styles.button, styles.errorButton]}
        >
          <Text style={styles.buttonText}>Back to library</Text>
        </Pressable>
      </View>
    );
  }

  if (digest === undefined) {
    return <ScreenLoader label="Opening your weekly shelf" />;
  }

  if (digest === null || digest.items.length === 0) {
    return (
      <View style={styles.empty}>
        <Stack.Screen options={{ title: "Weekly shelf" }} />
        <EmptyState
          title="Nothing waiting"
          message="Your weekly shelf will appear here when you have a few unopened saves."
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
      <Stack.Screen options={{ title: "Weekly shelf" }} />
      <MasonryFeed
        items={digest.items}
        numColumns={2}
        source={{ from: "home" }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.eyebrow}>A FEW SAVES WORTH REVISITING</Text>
            <Text style={styles.title}>Your weekly shelf</Text>
            <Text style={styles.subtitle}>
              {digest.itemCount} unopened{" "}
              {digest.itemCount === 1 ? "save" : "saves"} are waiting for you.
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={openNext}
              style={({ pressed }) => [
                styles.button,
                pressed && { opacity: 0.8 },
              ]}
            >
              <Text style={styles.buttonText}>Open next</Text>
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
  title: {
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
