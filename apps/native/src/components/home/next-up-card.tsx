import { t, useAppLocale } from "@/lib/i18n";
import { AppSymbolIcon } from "@/components/symbol";
import { displayHost } from "@/lib/url";
import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type NextUp = NonNullable<FunctionReturnType<typeof api.items.nextUp>>;

/** Why the save is offered, and the glyph shown when it has no picture. */
const KINDS = {
  read: { reason: "home.nextUpRead", symbol: "doc.text" },
  cook: { reason: "home.nextUpCook", symbol: "fork.knife" },
  watch: { reason: "home.nextUpWatch", symbol: "play.rectangle" },
  open: { reason: "home.nextUpOpen", symbol: "rectangle.stack" },
} as const satisfies Record<NextUp["kind"], object>;

/**
 * The "Open this next" card on Home: one save worth going back to, as a
 * single tappable row on the warm tint, set apart from the feed below it.
 * Purely presentational; lib/next-up.ts picks the save and owns its
 * analytics.
 */
export function NextUpCard({
  next,
  onShown,
  onOpen,
  onDismiss,
}: {
  next: NextUp;
  onShown: () => void;
  onOpen: () => void;
  onDismiss: () => void;
}) {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  // Counted while Home is on screen, not while another screen covers it.
  useFocusEffect(useCallback(() => onShown(), [onShown]));
  const { item } = next;
  const imageUri = item.imageUrl ?? item.heroImageUrl;
  const host = item.url ? displayHost(item.url) : undefined;
  const { reason, symbol } = KINDS[next.kind];
  return (
    <View style={styles.wrap} testID="next-up-card">
      {/* No `Link asChild`: its Slot drops a Pressable style function. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${t("home.nextUpTitle")}: ${next.subject}`}
        testID="next-up-open"
        onPress={() => {
          onOpen();
          router.push({ pathname: "/item/[id]", params: { id: item._id } });
        }}
        style={({ pressed }) => [
          styles.card,
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <View style={styles.thumb}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              recyclingKey={item._id}
              contentFit="cover"
              style={styles.thumbImage}
            />
          ) : (
            <AppSymbolIcon
              name={symbol}
              size={24}
              tintColor={theme.colors.primaryText}
            />
          )}
        </View>
        <View style={styles.text}>
          <Text style={styles.kicker} numberOfLines={1}>
            {t("home.nextUpTitle")}
          </Text>
          <Text style={styles.title} numberOfLines={2}>
            {next.subject}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {host ? `${t(reason)} · ${host}` : t(reason)}
          </Text>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.notNow")}
        testID="next-up-dismiss"
        onPress={onDismiss}
        style={({ pressed }) => [
          styles.dismiss,
          pressed && { opacity: theme.opacity.pressed },
        ]}
      >
        <View style={styles.dismissDot}>
          <AppSymbolIcon
            name="xmark"
            size={14}
            tintColor={theme.colors.muted}
          />
        </View>
      </Pressable>
    </View>
  );
}

const THUMB = 72;

const styles = StyleSheet.create((theme) => ({
  wrap: {
    marginHorizontal: theme.gap(2),
    marginTop: theme.gap(1),
    marginBottom: theme.gap(2),
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
    // Room for the dismiss button in the top corner.
    paddingRight: theme.gap(5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
  thumbImage: {
    width: "100%",
    height: "100%",
  },
  text: {
    flex: 1,
    gap: theme.gap(0.25),
  },
  kicker: {
    ...theme.type.captionStrong,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  title: {
    ...theme.type.header,
    lineHeight: 23,
    color: theme.colors.foreground,
  },
  meta: {
    ...theme.type.caption,
    color: theme.colors.muted,
  },
  // A full-size tap target around the small visible circle.
  dismiss: {
    position: "absolute",
    top: 0,
    right: 0,
    width: theme.control.minHeight,
    height: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  dismissDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface,
  },
}));
