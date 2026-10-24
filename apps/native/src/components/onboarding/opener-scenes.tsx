import { t, useAppLocale } from "@/lib/i18n";
import { riseIn } from "@/lib/motion";
import type { TextMessageKey } from "@/locales/message-types";
import { PHONE_CUT } from "@/components/onboarding/opener-phone";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { Image } from "expo-image";
import { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Generated for the app, so it carries no licensing or brand questions.
const VIDEO = require("../../../assets/onboarding/prague.jpg");
const APP_ICON = require("../../../assets/icon.png");

export type SceneProps = {
  shown: boolean;
};

const RAIL: AppSymbolName[] = [
  "heart.fill",
  "bubble.right.fill",
  "square.and.arrow.up.fill",
];

const SHEET_APPS: { icon: AppSymbolName; label: TextMessageKey }[] = [
  { icon: "message.fill", label: "onboarding.sceneMessages" },
  { icon: "note.text", label: "onboarding.sceneNotes" },
];

export function ShareScene({ shown }: SceneProps) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View style={styles.fill}>
      <Image source={VIDEO} contentFit="cover" style={styles.fill} />
      <View
        pointerEvents="none"
        style={[
          styles.videoShade,
          {
            // Inline for the same Unistyles theme-change bug as PhoneFrame's fade.
            experimental_backgroundImage: `linear-gradient(180deg, transparent 0%, ${theme.colors.overlay} 100%)`,
          },
        ]}
      />
      <View style={styles.rail}>
        {RAIL.map((name) => (
          <AppSymbolIcon
            key={name}
            name={name}
            size={22}
            tintColor={theme.colors.onOverlay}
          />
        ))}
      </View>
      {shown ? (
        <Animated.View entering={riseIn} style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.appRow}>
            {SHEET_APPS.map((app) => (
              <View key={app.label} style={styles.app}>
                <View style={styles.appTile}>
                  <AppSymbolIcon
                    name={app.icon}
                    size={20}
                    tintColor={theme.colors.muted}
                  />
                </View>
                <Text style={styles.appLabel} numberOfLines={1}>
                  {t(app.label)}
                </Text>
              </View>
            ))}
            <View style={styles.app}>
              <View style={styles.shelvrRing}>
                <Image source={APP_ICON} style={styles.shelvrIcon} />
              </View>
              <Text
                style={[styles.appLabel, styles.appLabelOn]}
                numberOfLines={1}
              >
                Shelvr
              </Text>
            </View>
            <View style={styles.app}>
              <View style={styles.appTile}>
                <AppSymbolIcon
                  name="ellipsis"
                  size={20}
                  tintColor={theme.colors.muted}
                />
              </View>
              <Text style={styles.appLabel} numberOfLines={1}>
                {t("onboarding.sceneMore")}
              </Text>
            </View>
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const PLACES: { name: TextMessageKey; icon: AppSymbolName }[] = [
  { name: "onboarding.scenePasteis", icon: "cup.and.saucer.fill" },
  { name: "onboarding.sceneMiradouro", icon: "binoculars.fill" },
  { name: "onboarding.sceneTimeOut", icon: "fork.knife" },
  { name: "onboarding.sceneLxFactory", icon: "paintpalette.fill" },
];

export function FileScene(_props: SceneProps) {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View style={styles.appScreen}>
      <Text style={styles.spaceTitle}>{t("onboarding.sceneLisbon")}</Text>
      <Text style={styles.spaceMeta}>{t("onboarding.sceneSpaceMeta")}</Text>
      <View style={styles.grid}>
        {PLACES.map((place) => (
          <View key={place.name} style={styles.card}>
            <View style={styles.cardTile}>
              <AppSymbolIcon
                name={place.icon}
                size={22}
                tintColor={theme.colors.primaryText}
              />
            </View>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {t(place.name)}
            </Text>
            <View style={styles.tag}>
              <Text style={styles.tagText}>
                {t("onboarding.scenePlaceTag")}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function FiledToast() {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <Animated.View entering={riseIn} style={styles.toast}>
      <AppSymbolIcon
        name="checkmark"
        size={12}
        weight="bold"
        tintColor={theme.colors.primary}
      />
      <Text style={styles.toastText}>{t("onboarding.sceneFiled")}</Text>
    </Animated.View>
  );
}

type Point = { x: number; y: number };

const PINS: Point[] = [
  { x: 0.26, y: 0.3 },
  { x: 0.6, y: 0.2 },
  { x: 0.74, y: 0.6 },
  { x: 0.34, y: 0.74 },
];

const BLOCKS = [
  { left: "6%", top: "8%", width: "26%", height: "18%" },
  { left: "40%", top: "6%", width: "32%", height: "14%" },
  { left: "8%", top: "40%", width: "20%", height: "24%" },
  { left: "50%", top: "36%", width: "40%", height: "18%" },
  { left: "32%", top: "52%", width: "14%", height: "16%" },
] as const;

const STOPS: { slot: TextMessageKey; name: TextMessageKey }[] = [
  { slot: "onboarding.sceneMorning", name: "onboarding.sceneMiradouro" },
  { slot: "onboarding.sceneLunch", name: "onboarding.sceneTimeOut" },
  { slot: "onboarding.sceneAfternoon", name: "onboarding.sceneLxFactory" },
  { slot: "onboarding.sceneEvening", name: "onboarding.scenePasteis" },
];

const DOT_SPACING = 7;

function routeDots(points: Point[], width: number, height: number): Point[] {
  const dots: Point[] = [];
  for (let i = 1; i < points.length; i++) {
    const from = { x: points[i - 1].x * width, y: points[i - 1].y * height };
    const to = { x: points[i].x * width, y: points[i].y * height };
    const steps = Math.floor(
      Math.hypot(to.x - from.x, to.y - from.y) / DOT_SPACING,
    );
    for (let k = 2; k < steps - 1; k++) {
      dots.push({
        x: from.x + ((to.x - from.x) * k) / steps,
        y: from.y + ((to.y - from.y) * k) / steps,
      });
    }
  }
  return dots;
}

export function PlanScene(_props: SceneProps) {
  useAppLocale();
  const [map, setMap] = useState({ width: 0, height: 0 });
  const onMapLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setMap((current) =>
      current.width === width && current.height === height
        ? current
        : { width, height },
    );
  };
  return (
    <View style={styles.appScreen}>
      <View style={styles.map} onLayout={onMapLayout}>
        {BLOCKS.map((block, index) => (
          <View key={index} style={[styles.block, block]} />
        ))}
        <View style={styles.river} />
        {map.width > 0
          ? routeDots(PINS, map.width, map.height).map((dot, index) => (
              <View
                key={index}
                style={[styles.routeDot, { left: dot.x, top: dot.y }]}
              />
            ))
          : null}
        {PINS.map((pin, index) => (
          <View
            key={index}
            style={[
              styles.pin,
              { left: `${pin.x * 100}%`, top: `${pin.y * 100}%` },
            ]}
          >
            <Text style={styles.pinText}>{index + 1}</Text>
          </View>
        ))}
      </View>
      <View style={styles.day}>
        <Text style={styles.dayTitle}>{t("onboarding.sceneDayTitle")}</Text>
        {STOPS.map((stop) => (
          <View key={stop.slot} style={styles.stop}>
            <Text
              style={styles.stopSlot}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {t(stop.slot)}
            </Text>
            <Text
              style={styles.stopName}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              {t(stop.name)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const TILE = 44;
const PIN = 22;
const ROUTE_DOT = 3;

const styles = StyleSheet.create((theme) => ({
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  videoShade: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "60%",
  },
  rail: {
    position: "absolute",
    right: theme.gap(1.5),
    top: "34%",
    gap: theme.gap(2.5),
    alignItems: "center",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: 150 + PHONE_CUT,
    paddingTop: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    gap: theme.gap(1.5),
    alignItems: "center",
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
  },
  grabber: {
    width: 36,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: theme.colors.border,
  },
  appRow: {
    alignSelf: "stretch",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  app: {
    width: TILE + theme.gap(0.5),
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  appTile: {
    width: TILE,
    height: TILE,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  appLabel: {
    ...theme.type.badge,
    color: theme.colors.muted,
  },
  appLabelOn: {
    color: theme.colors.foreground,
  },
  shelvrRing: {
    width: TILE,
    height: TILE,
    padding: 2,
    borderRadius: theme.radius.md + 2,
    borderCurve: "continuous",
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  shelvrIcon: {
    flex: 1,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
  },
  appScreen: {
    flex: 1,
    paddingTop: theme.gap(5),
    paddingHorizontal: theme.gap(1.75),
    gap: theme.gap(0.5),
  },
  spaceTitle: {
    ...theme.type.title,
    color: theme.colors.foreground,
  },
  spaceMeta: {
    ...theme.type.finePrint,
    color: theme.colors.muted,
  },
  grid: {
    marginTop: theme.gap(1),
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  card: {
    flexGrow: 1,
    flexBasis: "45%",
    padding: theme.gap(0.75),
    gap: theme.gap(0.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cardTile: {
    aspectRatio: 1.7,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  cardTitle: {
    ...theme.type.captionStrong,
    lineHeight: 15,
    minHeight: 30,
    color: theme.colors.foreground,
  },
  tag: {
    alignSelf: "flex-start",
    paddingHorizontal: theme.gap(0.75),
    paddingVertical: 2,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceMuted,
  },
  tagText: {
    ...theme.type.badge,
    color: theme.colors.muted,
  },
  toast: {
    position: "absolute",
    top: theme.gap(4),
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(1),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
  },
  toastText: {
    ...theme.type.labelStrong,
    color: theme.colors.background,
  },
  map: {
    flex: 1,
    minHeight: 120,
    marginTop: theme.gap(1),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  block: {
    position: "absolute",
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
  },
  river: {
    position: "absolute",
    left: "-10%",
    right: "-10%",
    bottom: "-8%",
    height: "20%",
    transform: [{ rotate: "-7deg" }],
    backgroundColor: theme.colors.border,
  },
  routeDot: {
    position: "absolute",
    width: ROUTE_DOT,
    height: ROUTE_DOT,
    marginLeft: -ROUTE_DOT / 2,
    marginTop: -ROUTE_DOT / 2,
    borderRadius: ROUTE_DOT / 2,
    backgroundColor: theme.colors.primary,
  },
  pin: {
    position: "absolute",
    width: PIN,
    height: PIN,
    marginLeft: -PIN / 2,
    marginTop: -PIN / 2,
    borderRadius: PIN / 2,
    borderWidth: 2,
    borderColor: theme.colors.frame,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  pinText: {
    ...theme.type.badge,
    color: theme.colors.onTint,
  },
  day: {
    paddingTop: theme.gap(1.5),
    paddingBottom: PHONE_CUT + theme.gap(6),
    gap: theme.gap(0.75),
  },
  dayTitle: {
    ...theme.type.labelStrong,
    color: theme.colors.foreground,
  },
  stop: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  stopSlot: {
    ...theme.type.badge,
    width: 72,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  stopName: {
    ...theme.type.captionLabel,
    flex: 1,
    color: theme.colors.foreground,
  },
}));
