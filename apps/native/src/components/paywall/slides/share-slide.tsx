import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { t } from "@/lib/i18n";
import { Image } from "expo-image";
import { Text, View } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { phase, track, useLoop } from "../loop";

/*
 * Slide 1: a post in Instagram, the share sheet, Shelvr, and the toast that
 * says where it was filed. One 6 s loop; the README's keyframes are the
 * percentages below. Only the Instagram example ships (the README allows it).
 */

// TODO(press-kit): the source tiles are placeholders; see
// assets/sources/README.md for the official icons to swap in.
const SOURCES = [
  require("../../../../assets/sources/instagram.png"),
  require("../../../../assets/sources/safari.png"),
  require("../../../../assets/sources/tiktok.png"),
  require("../../../../assets/sources/x.png"),
  require("../../../../assets/sources/youtube.png"),
  require("../../../../assets/sources/pinterest.png"),
  require("../../../../assets/sources/medium.png"),
];
const ACTIVE_SOURCE = 0;
const RAMEN = require("../../../../assets/onboarding/ramen.jpg");
const APP_ICON = require("../../../../assets/icon.png");

// An account handle, the same in every language.
const DEMO_HANDLE = "@weeknight.ramen";
const LOOP_MS = 6000;
const SHEET_HEIGHT = 178;

// Tap ring: a dot at 40–50 %, a ring growing 42–56 %, played with an offset.
function useTapStyles(progress: { value: number }, offset: number) {
  const ring = useAnimatedStyle(() => {
    const p = phase(progress.value, offset);
    return {
      opacity:
        track(p, [0.42, 0.56], [0.9, 0]) * (p >= 0.42 && p <= 0.56 ? 1 : 0),
      transform: [{ scale: track(p, [0.42, 0.56], [0.6, 2.2]) }],
    };
  });
  const dot = useAnimatedStyle(() => {
    const p = phase(progress.value, offset);
    return { opacity: p >= 0.4 && p <= 0.5 ? 1 : 0 };
  });
  return { ring, dot };
}

export function ShareSlide({ animate }: { animate: boolean }) {
  const { theme } = useUnistyles();
  const progress = useLoop(LOOP_MS, animate, 0);
  // "Offset −3 s" and "−1.2 s" of a 6 s loop.
  const tap1 = useTapStyles(progress, 0.5);
  const tap2 = useTapStyles(progress, 0.2);
  const sheet = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: track(
          progress.value,
          [0.14, 0.24, 0.52, 0.6],
          [SHEET_HEIGHT + 12, 0, 0, SHEET_HEIGHT + 12],
        ),
      },
    ],
  }));
  const toast = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: track(
          progress.value,
          [0.6, 0.66, 0.88, 0.94],
          [-80, 0, 0, -80],
        ),
      },
    ],
  }));

  return (
    <View style={styles.fill}>
      <View style={styles.sources}>
        {SOURCES.map((source, index) => (
          <View key={index}>
            {index === ACTIVE_SOURCE ? (
              <View style={styles.sourceRing} />
            ) : null}
            <Image source={source} style={styles.sourceTile} />
          </View>
        ))}
      </View>
      <View style={styles.post}>
        <Image source={RAMEN} style={styles.photo} contentFit="cover" />
        <View
          style={[
            styles.scrim,
            {
              experimental_backgroundImage: `linear-gradient(180deg, transparent 0%, ${theme.colors.overlay} 100%)`,
            },
          ]}
        />
        <View style={styles.caption}>
          <View style={styles.avatar} />
          <Text style={styles.handle} numberOfLines={1}>
            {DEMO_HANDLE}
          </Text>
          <View>
            <AppSymbolIcon
              name="square.and.arrow.up"
              size={20}
              tintColor={theme.colors.onOverlay}
            />
            <Animated.View style={[styles.ring, tap1.ring]} />
            <Animated.View style={[styles.tapDot, tap1.dot]} />
          </View>
        </View>
      </View>
      <Animated.View style={[styles.sheet, sheet]}>
        <View style={styles.handleBar} />
        <View style={styles.targets}>
          <View style={styles.target}>
            <View>
              <Image source={APP_ICON} style={styles.targetIcon} />
              <Animated.View style={[styles.targetRing, tap2.ring]} />
            </View>
            <Text style={styles.targetLabel(true)}>Shelvr</Text>
          </View>
          <ShareTarget icon="bubble.left" label={t("paywall.shareMessages")} />
          <ShareTarget icon="envelope" label={t("paywall.shareMail")} />
          <ShareTarget icon="ellipsis" label={t("paywall.shareMore")} />
        </View>
        <View style={styles.copyRow}>
          <Text style={styles.copyText}>{t("paywall.shareCopyLink")}</Text>
          <AppSymbolIcon
            name="doc.on.doc"
            size={16}
            tintColor={theme.colors.muted}
          />
        </View>
      </Animated.View>
      <Animated.View style={[styles.toast, toast]}>
        <Image source={APP_ICON} style={styles.toastIcon} />
        <View style={styles.toastText}>
          <Text style={styles.toastTitle}>{t("paywall.demoSaved")}</Text>
          <Text style={styles.toastLine} numberOfLines={1}>
            {t("paywall.demoFiledPill", {
              space: t("paywall.demoSpaceRecipes"),
            })}
            {" · "}
            <Text style={styles.toastTags}>{t("paywall.demoTagsRamen")}</Text>
          </Text>
        </View>
        <AppSymbolIcon
          name="checkmark.circle.fill"
          size={20}
          tintColor={theme.colors.primaryText}
        />
      </Animated.View>
    </View>
  );
}

function ShareTarget({ icon, label }: { icon: AppSymbolName; label: string }) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.target}>
      <View style={styles.targetMuted}>
        <AppSymbolIcon name={icon} size={24} tintColor={theme.colors.muted} />
      </View>
      <Text style={styles.targetLabel(false)} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  fill: { flex: 1 },
  sources: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  sourceTile: { width: 26, height: 26, borderRadius: 7 },
  sourceRing: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  post: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 56,
    bottom: 34,
    borderRadius: 12,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: theme.colors.imageBorder,
  },
  photo: { ...StyleSheet.absoluteFillObject },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, height: 90 },
  caption: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatar: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.onOverlay,
    opacity: 0.35,
  },
  handle: {
    flex: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.onOverlay,
    textShadowColor: theme.colors.overlay,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  ring: {
    position: "absolute",
    top: -4,
    left: -4,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  tapDot: {
    position: "absolute",
    top: 5,
    left: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.primary,
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: SHEET_HEIGHT,
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingTop: 10,
    paddingHorizontal: 20,
    shadowColor: theme.colors.primaryForeground,
    shadowOpacity: 0.12,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: -10 },
    elevation: 6,
  },
  handleBar: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
  },
  targets: {
    marginTop: 14,
    flexDirection: "row",
    justifyContent: "space-evenly",
  },
  target: { alignItems: "center", gap: 6, width: 64 },
  targetIcon: { width: 56, height: 56, borderRadius: 14 },
  targetRing: {
    position: "absolute",
    top: 8,
    left: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: theme.colors.primary,
  },
  targetMuted: {
    width: 56,
    height: 56,
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  targetLabel: (strong: boolean) => ({
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: strong ? theme.colors.foreground : theme.colors.muted,
  }),
  copyRow: {
    marginTop: 12,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
  },
  copyText: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
  },
  toast: {
    position: "absolute",
    left: 16,
    right: 16,
    top: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: theme.colors.primaryForeground,
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  toastIcon: { width: 34, height: 34, borderRadius: 8 },
  toastText: { flex: 1 },
  toastTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.foreground,
  },
  toastLine: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.muted,
  },
  toastTags: { color: theme.colors.primaryText },
}));
