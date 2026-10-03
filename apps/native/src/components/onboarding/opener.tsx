import { t, useAppLocale } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { CtaButton } from "@/components/onboarding/parts";
import { withAlpha } from "@/lib/color";
import { Image } from "expo-image";
import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// The collage never shrinks below this. When the headline pushes it past the
// screen, the step scrolls instead.
const COLLAGE_MIN_HEIGHT = 220;

// Sample saves for the collage. The photos are generated for the app, so they
// carry no licensing or brand questions.
type Tile =
  | {
      kind: "link";
      titleKey: TextMessageKey;
      domain: string;
      height: number;
      image: number;
    }
  | { kind: "note"; titleKey: TextMessageKey };

const COLUMNS: Tile[][] = [
  [
    {
      kind: "link",
      titleKey: "onboarding.sampleTee",
      domain: "everlane.com",
      height: 188,
      image: require("../../../assets/onboarding/tee.jpg"),
    },
    { kind: "note", titleKey: "onboarding.sampleNote" },
    {
      kind: "link",
      titleKey: "onboarding.sampleEspresso",
      domain: "ebay.co.uk",
      height: 86,
      image: require("../../../assets/onboarding/espresso.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleFinishBook",
      domain: "theatlantic.com",
      height: 110,
      image: require("../../../assets/onboarding/book.jpg"),
    },
  ],
  [
    {
      kind: "link",
      titleKey: "onboarding.sampleOneThing",
      domain: "nytimes.com",
      height: 122,
      image: require("../../../assets/onboarding/reading.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleRamen",
      domain: "bbcgoodfood.com",
      height: 94,
      image: require("../../../assets/onboarding/ramen.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.samplePrague",
      domain: "cntraveler.com",
      height: 130,
      image: require("../../../assets/onboarding/prague.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleSofa",
      domain: "article.com",
      height: 108,
      image: require("../../../assets/onboarding/sofa.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleDiner",
      domain: "eater.com",
      height: 100,
      image: require("../../../assets/onboarding/diner.jpg"),
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
  const [viewport, setViewport] = useState(0);
  const [collageTop, setCollageTop] = useState(0);
  // Only the largest text sizes overflow. Everywhere else the content is
  // pinned to the viewport, so the collage fills the gap and its fade shows,
  // exactly as before this step could scroll.
  const overflows = viewport > 0 && collageTop + COLLAGE_MIN_HEIGHT > viewport;

  return (
    <View style={styles.wrap}>
      {/* At the largest text sizes the headline alone can fill most of the
          screen, so the headline and collage scroll. "Start yours" stays
          pinned below. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.body, overflows && styles.bodyScrolls]}
        scrollEnabled={overflows}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => setViewport(event.nativeEvent.layout.height)}
      >
        <View style={styles.head}>
          <Text style={styles.headline}>{t("onboarding.openerTitle")}</Text>
          <Text style={styles.support}>{t("onboarding.openerBody")}</Text>
        </View>

        <View
          style={[styles.collage, overflows && styles.collageScrolls]}
          onLayout={(event) => setCollageTop(event.nativeEvent.layout.y)}
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
                    <Image
                      source={tile.image}
                      contentFit="cover"
                      style={[styles.thumb, { height: tile.height }]}
                    />
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
      </ScrollView>

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
          style={({ pressed }) => [styles.signIn, pressed && { opacity: 0.7 }]}
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
  scroll: {
    flex: 1,
  },
  body: {
    flex: 1,
    gap: theme.gap(2),
  },
  bodyScrolls: {
    flex: 0,
    flexGrow: 1,
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
    minHeight: COLLAGE_MIN_HEIGHT,
    flexDirection: "row",
    gap: theme.gap(1),
    overflow: "hidden",
  },
  collageScrolls: {
    flex: 0,
    height: COLLAGE_MIN_HEIGHT,
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
    letterSpacing: 0.8,
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
    color: theme.colors.primaryText,
  },
}));
