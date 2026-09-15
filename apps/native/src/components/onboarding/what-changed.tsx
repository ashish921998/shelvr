import type { FeedItem } from "@/components/item-card";
import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import { onboardingLabel } from "@/lib/onboarding-labels";
import { searchWordFor } from "@/lib/reveal-pieces";
import { displayHost } from "@/lib/url";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Step 7, the step that names what the save bought them. Every beat is drawn
// from the save they just watched land: the space it went to, a real search
// that really returns it, and the weekly shelf it will show up in. The search
// beat runs the production query and shows nothing when the item is not in the
// result, so this screen can never promise a lookup that would not work.

export function WhatChangedStep({
  item,
  spaceNames,
  savedSpaces,
  onAdvance,
}: {
  item: FeedItem;
  /** Already-localized labels for the spaces the user created. */
  spaceNames: string[];
  /** The names the demo save actually landed in, straight from the server. */
  savedSpaces: string[];
  onAdvance: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();

  const home = savedSpaces[0];
  const homeLabel = home === undefined ? null : onboardingLabel(home);
  const filedIntoSpace = homeLabel !== null && spaceNames.includes(homeLabel);
  const rows = [
    ...spaceNames.map((name) => ({
      key: name,
      label: name,
      highlighted: filedIntoSpace && name === homeLabel,
    })),
    {
      key: "shelf",
      label: t("onboarding.changedInbox"),
      highlighted: !filedIntoSpace,
    },
  ];

  const word = searchWordFor(item.title);
  const search = useQuery(
    convexQuery(
      api.items.searchItems,
      word === null ? "skip" : { query: word },
    ),
  );
  const findable =
    word !== null &&
    (search.data?.some((row) => row._id === item._id) ?? false);

  const itemTitle =
    item.title ?? item.siteName ?? item.url ?? t("item.untitled");

  return (
    <View style={styles.wrap}>
      <Animated.Text
        entering={FadeInDown.duration(400)}
        style={styles.headline}
      >
        {t("onboarding.changedTitle")}
      </Animated.Text>

      <Beat delay={80} title={t("onboarding.changedHomeTitle")}>
        <View style={styles.shelfRows}>
          {rows.map((row) => (
            <View
              key={row.key}
              style={[styles.shelfRow, row.highlighted && styles.shelfRowHome]}
            >
              <Text
                style={[
                  styles.shelfRowLabel,
                  row.highlighted && styles.shelfRowLabelHome,
                ]}
                numberOfLines={1}
              >
                {row.label}
              </Text>
              {row.highlighted && (
                <View style={styles.shelfRowItem}>
                  <Thumbnail item={item} />
                  <Text style={styles.shelfRowItemTitle} numberOfLines={1}>
                    {itemTitle}
                  </Text>
                </View>
              )}
            </View>
          ))}
        </View>
        <Text style={styles.beatBody}>{t("onboarding.changedHomeBody")}</Text>
      </Beat>

      <Beat delay={160} title={t("onboarding.changedSearchTitle")}>
        {word !== null && (
          <View style={styles.searchMock}>
            <View style={styles.searchField}>
              <AppSymbolIcon
                name="magnifyingglass"
                size={14}
                tintColor={theme.colors.faint}
              />
              <Text style={styles.searchWord}>{word}</Text>
            </View>
            {findable && (
              <View style={styles.searchResult}>
                <Thumbnail item={item} />
                <View style={styles.searchResultText}>
                  <Text style={styles.searchResultTitle} numberOfLines={1}>
                    {itemTitle}
                  </Text>
                  {item.url ? (
                    <Text style={styles.searchResultHost} numberOfLines={1}>
                      {displayHost(item.url)}
                    </Text>
                  ) : null}
                </View>
              </View>
            )}
          </View>
        )}
        <Text style={styles.beatBody}>{t("onboarding.changedSearchBody")}</Text>
      </Beat>

      <Beat delay={240} title={t("onboarding.changedDigestTitle")}>
        <View style={styles.notification}>
          <View style={styles.appIcon} />
          <View style={styles.notificationText}>
            <View style={styles.notificationHeader}>
              <Text style={styles.notificationApp}>Shelvr</Text>
              <Text style={styles.notificationWhen}>
                {t("onboarding.changedSunday")}
              </Text>
            </View>
            <Text style={styles.notificationTitle}>{t("digest.title")}</Text>
            <Text style={styles.notificationBody} numberOfLines={2}>
              {t("onboarding.changedDigestBody", { title: itemTitle })}
            </Text>
          </View>
        </View>
      </Beat>

      <View style={styles.footer}>
        <Animated.View
          entering={FadeInDown.delay(320).duration(400)}
          style={styles.fullWidth}
        >
          <CtaButton label={t("common.continue")} onPress={onAdvance} />
        </Animated.View>
      </View>
    </View>
  );
}

function Beat({
  delay,
  title,
  children,
}: {
  delay: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(400)}
      style={styles.beat}
    >
      <Text style={styles.beatEyebrow}>{title}</Text>
      {children}
    </Animated.View>
  );
}

function Thumbnail({ item }: { item: FeedItem }) {
  const imageUri = item.heroImageUrl ?? item.imageUrl;
  if (!imageUri)
    return <View style={[styles.thumbnail, styles.thumbnailBlank]} />;
  return (
    <Image
      source={{ uri: imageUri }}
      recyclingKey={item._id}
      contentFit="cover"
      style={styles.thumbnail}
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2.5),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  beat: {
    gap: theme.gap(1.25),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  beatEyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  beatBody: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted,
  },
  shelfRows: {
    gap: theme.gap(0.75),
  },
  shelfRow: {
    gap: theme.gap(1),
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  shelfRowHome: {
    backgroundColor: theme.colors.primarySoft,
  },
  shelfRowLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
  shelfRowLabelHome: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.primaryText,
  },
  shelfRowItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  shelfRowItemTitle: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.foreground,
  },
  searchMock: {
    gap: theme.gap(1),
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  searchWord: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  searchResult: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    paddingHorizontal: theme.gap(0.5),
  },
  searchResultText: {
    flex: 1,
    gap: 2,
  },
  searchResultTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  searchResultHost: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    color: theme.colors.muted,
  },
  notification: {
    flexDirection: "row",
    gap: theme.gap(1.25),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  appIcon: {
    width: 34,
    height: 34,
    borderRadius: 9,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
  },
  notificationText: {
    flex: 1,
    gap: 2,
  },
  notificationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  notificationApp: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.4,
    color: theme.colors.muted,
  },
  notificationWhen: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: theme.colors.faint,
  },
  notificationTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  notificationBody: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  thumbnail: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  thumbnailBlank: {
    backgroundColor: theme.colors.border,
  },
  footer: {
    marginTop: "auto",
    width: "100%",
  },
  fullWidth: {
    width: "100%",
  },
}));
