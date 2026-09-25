import { t, useAppLocale } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { CtaButton } from "@/components/onboarding/parts";
import { ShelfRow } from "@/components/shelf/shelf-row";
import { useInkClock } from "@/lib/ink/use-ink-clock";
import { Pressable, Text, View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// Sample saves for the collage. The photos are generated for the app, so they
// carry no licensing or brand questions.
type Tile =
  | {
      kind: "link";
      titleKey: TextMessageKey;
      aspect: number;
      image: number;
    }
  | { kind: "note"; titleKey: TextMessageKey };

const SHELVES: Tile[][] = [
  [
    {
      kind: "link",
      titleKey: "onboarding.sampleTee",
      aspect: 0.8,
      image: require("../../../assets/onboarding/tee.jpg"),
    },
    { kind: "note", titleKey: "onboarding.sampleNote" },
    {
      kind: "link",
      titleKey: "onboarding.sampleEspresso",
      aspect: 0.8,
      image: require("../../../assets/onboarding/espresso.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleFinishBook",
      aspect: 0.8,
      image: require("../../../assets/onboarding/book.jpg"),
    },
  ],
  [
    {
      kind: "link",
      titleKey: "onboarding.sampleOneThing",
      aspect: 0.8,
      image: require("../../../assets/onboarding/reading.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleRamen",
      aspect: 0.8,
      image: require("../../../assets/onboarding/ramen.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.samplePrague",
      aspect: 0.8,
      image: require("../../../assets/onboarding/prague.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleSofa",
      aspect: 0.8,
      image: require("../../../assets/onboarding/sofa.jpg"),
    },
    {
      kind: "link",
      titleKey: "onboarding.sampleDiner",
      aspect: 0.8,
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
  const { width } = useWindowDimensions();
  const clock = useInkClock();

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.headline}>{t("onboarding.openerTitle")}</Text>
        <Text style={styles.support}>{t("onboarding.openerBody")}</Text>
      </View>

      <View
        style={styles.shelves}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {SHELVES.map((row, index) => (
          <ShelfRow
            key={index}
            width={width - 48}
            clock={clock}
            seed={index}
            scrollable={false}
            prop={index === 0 ? "mug" : "plant"}
            cards={row.map((tile) => ({
              key: tile.titleKey,
              imageSource: tile.kind === "link" ? tile.image : undefined,
              title: t(tile.titleKey),
              note: tile.kind === "note",
              mark:
                tile.kind === "note" ? ("note" as const) : ("article" as const),
              aspectRatio: tile.kind === "link" ? tile.aspect : undefined,
            }))}
          />
        ))}
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
  shelves: { flex: 1, justifyContent: "center", gap: 18 },
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
