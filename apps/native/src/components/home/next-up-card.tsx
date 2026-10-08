import { t, useAppLocale } from "@/lib/i18n";
import { InlineCard } from "@/components/ui/inline-card";
import { displayHost } from "@/lib/url";
import type { api } from "@convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type NextUp = NonNullable<FunctionReturnType<typeof api.items.nextUp>>;

/**
 * The "Open this next" card on Home: one save worth going back to. Purely
 * presentational; lib/next-up.ts picks the save and owns its analytics.
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
  useEffect(onShown, [onShown]);
  const { item } = next;
  const imageUri = item.imageUrl ?? item.heroImageUrl;
  const title = next.subject;
  const host = item.url ? displayHost(item.url) : undefined;
  return (
    <InlineCard
      testID="next-up-card"
      title={t("home.nextUpTitle")}
      body={next.kind === "cook" ? t("home.nextUpCook") : t("home.nextUpRead")}
    >
      {/* No `Link asChild`: its Slot drops a Pressable style function. */}
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={title}
        testID="next-up-open"
        onPress={() => {
          onOpen();
          router.push({ pathname: "/item/[id]", params: { id: item._id } });
        }}
        style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
      >
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            recyclingKey={item._id}
            contentFit="cover"
            style={styles.thumb}
          />
        ) : null}
        <View style={styles.text}>
          <Text style={styles.itemTitle} numberOfLines={2}>
            {title}
          </Text>
          {host ? (
            <Text style={styles.host} numberOfLines={1}>
              {host}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.notNow")}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onDismiss}
        >
          <Text style={styles.secondaryButtonText}>{t("common.notNow")}</Text>
        </Pressable>
      </View>
    </InlineCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    marginTop: theme.gap(0.5),
  },
  thumb: {
    width: 64,
    height: 64,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  text: {
    flex: 1,
    gap: theme.gap(0.5),
  },
  itemTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    lineHeight: 20,
    color: theme.colors.foreground,
  },
  host: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.faint,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
