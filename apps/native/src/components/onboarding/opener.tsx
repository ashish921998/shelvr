import { t, useAppLocale } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { CtaButton } from "@/components/onboarding/parts";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { withAlpha } from "@/lib/tab-bar-motion";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Sample saves for the collage. No bundled photos: each tile is a tinted block,
// so the collage reads as "a shelf" without image licensing questions.
type Tile =
  | {
      kind: "link";
      titleKey: TextMessageKey;
      domain: string;
      height: number;
      icon: AppSymbolName;
      tint: "muted" | "soft";
    }
  | { kind: "note"; titleKey: TextMessageKey };

const COLUMNS: Tile[][] = [
  [
    {
      kind: "link",
      titleKey: "onboarding.sampleTee",
      domain: "everlane.com",
      height: 188,
      icon: "bag",
      tint: "soft",
    },
    { kind: "note", titleKey: "onboarding.sampleNote" },
    {
      kind: "link",
      titleKey: "onboarding.sampleEspresso",
      domain: "ebay.co.uk",
      height: 86,
      icon: "bag",
      tint: "muted",
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleFinishBook",
      domain: "theatlantic.com",
      height: 110,
      icon: "doc.text",
      tint: "soft",
    },
  ],
  [
    {
      kind: "link",
      titleKey: "onboarding.sampleOneThing",
      domain: "nytimes.com",
      height: 122,
      icon: "doc.text",
      tint: "muted",
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleRamen",
      domain: "bbcgoodfood.com",
      height: 94,
      icon: "star.fill",
      tint: "soft",
    },
    {
      kind: "link",
      titleKey: "onboarding.samplePrague",
      domain: "cntraveler.com",
      height: 130,
      icon: "map",
      tint: "muted",
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleSofa",
      domain: "article.com",
      height: 108,
      icon: "bag",
      tint: "soft",
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleDiner",
      domain: "eater.com",
      height: 100,
      icon: "map",
      tint: "muted",
    },
  ],
];

export function OpenerStep({
  onStart,
  onSignIn,
}: {
  onStart: () => void;
  onSignIn: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.headline}>{t("onboarding.openerTitle")}</Text>
        <Text style={styles.support}>{t("onboarding.openerBody")}</Text>
      </View>

      <View
        style={styles.collage}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {COLUMNS.map((column, index) => (
          <View key={index} style={styles.column}>
            {column.map((tile) =>
              tile.kind === "note" ? (
                <View key={tile.titleKey} style={[styles.tile, styles.note]}>
                  <Text style={styles.noteText}>{t(tile.titleKey)}</Text>
                </View>
              ) : (
                <View key={tile.titleKey} style={styles.tile}>
                  <View
                    style={[
                      styles.thumb,
                      { height: tile.height },
                      tile.tint === "soft" ? styles.thumbSoft : null,
                    ]}
                  >
                    <AppSymbolIcon
                      name={tile.icon}
                      size={22}
                      tintColor={
                        tile.tint === "soft"
                          ? theme.colors.primaryText
                          : theme.colors.faint
                      }
                    />
                  </View>
                  <View style={styles.meta}>
                    <Text style={styles.tileTitle} numberOfLines={2}>
                      {t(tile.titleKey)}
                    </Text>
                    <Text style={styles.domain}>{tile.domain}</Text>
                  </View>
                </View>
              ),
            )}
          </View>
        ))}
        <View pointerEvents="none" style={styles.fade} />
      </View>

      <View style={styles.foot}>
        <View style={styles.proLine}>
          <View style={styles.proPill}>
            <Text style={styles.proPillText}>Pro</Text>
          </View>
          <Text style={styles.proText}>{t("onboarding.proLine")}</Text>
        </View>
        <CtaButton label={t("onboarding.startYours")} onPress={onStart} />
        <Pressable
          accessibilityRole="button"
          onPress={onSignIn}
          style={({ pressed }) => [styles.signIn, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.signInText}>
            {t("onboarding.haveAccount")}{" "}
            <Text style={styles.signInLink}>{t("onboarding.signIn")}</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  head: {
    gap: theme.gap(1),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: -0.5,
    color: theme.colors.foreground,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  collage: {
    flex: 1,
    minHeight: 220,
    flexDirection: "row",
    gap: theme.gap(1),
    overflow: "hidden",
  },
  fade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 72,
    experimental_backgroundImage: `linear-gradient(180deg, ${withAlpha(
      theme.colors.background,
      0,
    )} 0%, ${theme.colors.background} 100%)`,
  },
  column: {
    flex: 1,
    gap: theme.gap(1),
  },
  tile: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  thumb: {
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbSoft: {
    backgroundColor: theme.colors.primarySoft,
  },
  meta: {
    padding: theme.gap(1),
    gap: 2,
  },
  tileTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 15,
    color: theme.colors.foreground,
  },
  domain: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: theme.colors.faint,
  },
  note: {
    padding: theme.gap(1.25),
  },
  noteText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  foot: {
    gap: theme.gap(1.5),
  },
  proLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1),
  },
  proPill: {
    paddingHorizontal: theme.gap(0.75),
    paddingVertical: 2,
    borderRadius: 50,
    backgroundColor: theme.colors.primarySoft,
  },
  proPillText: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  proText: {
    flexShrink: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
  signIn: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  signInText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
  },
  signInLink: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.primary,
  },
}));
