import { CityStampArt } from "@/components/passport/city-stamp";
import { QrCode } from "@/components/passport/qr-code";
import { StampArt } from "@/components/passport/stamp-sheet";
import { formatRecentDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import { stampDate, stampId } from "@/lib/passport";
import type { PassportStory } from "@/lib/passport-story";
import type { ComponentRef, ReactNode, Ref } from "react";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const BASE_WIDTH = 360;
const COLLAGE = { width: 270, height: 190 };
const COLLAGE_SCALE = 0.9;
const WITH_TOGETHER = 0.72;
const SAFE_BOTTOM = 118;

type Slot = { left: number; top: number; size: number; tilt: string };

const CITY_SLOTS: Slot[] = [
  { left: 8, top: 8, size: 90, tilt: "-8deg" },
  { left: 112, top: 96, size: 80, tilt: "7deg" },
];

const PHOTO_SLOTS: Slot[] = [
  { left: 110, top: 0, size: 80, tilt: "5deg" },
  { left: 194, top: 22, size: 72, tilt: "-6deg" },
  { left: 30, top: 108, size: 74, tilt: "4deg" },
  { left: 198, top: 104, size: 70, tilt: "-3deg" },
];

function Placed({
  slot,
  s,
  children,
}: {
  slot: Slot;
  s: number;
  children: ReactNode;
}) {
  return (
    <View
      style={{
        position: "absolute",
        left: slot.left * s,
        top: slot.top * s,
        transform: [{ rotate: slot.tilt }],
      }}
    >
      {children}
    </View>
  );
}

function Collage({ story, s }: { story: PassportStory; s: number }) {
  return (
    <View
      testID="passport-story-collage"
      style={{
        alignSelf: "center",
        width: COLLAGE.width * s,
        height: COLLAGE.height * s,
        marginTop: 14 * s,
      }}
    >
      {story.cityStamps.map((city, index) => (
        <Placed key={city.name} slot={CITY_SLOTS[index]} s={s}>
          <CityStampArt
            name={city.name}
            country={city.country}
            size={CITY_SLOTS[index].size * s}
            tilt="0deg"
          />
        </Placed>
      ))}
      {story.photos.map((stamp, index) => {
        const at = stampDate(stamp);
        return (
          <Placed key={stampId(stamp)} slot={PHOTO_SLOTS[index]} s={s}>
            <StampArt
              cover={stamp.cover}
              ink={at === null ? (stamp.city ?? "") : formatRecentDate(at)}
              size={PHOTO_SLOTS[index].size * s}
            />
          </Placed>
        );
      })}
      {story.more > 0 ? (
        <View
          style={[
            styles.more,
            {
              right: -6 * s,
              bottom: -4 * s,
              paddingHorizontal: 10 * s,
              paddingVertical: 4 * s,
            },
          ]}
        >
          <Text
            allowFontScaling={false}
            style={[styles.moreText, { fontSize: 14 * s }]}
          >
            {t("passportStory.more", { more: String(story.more) })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function Count({
  value,
  label,
  s,
}: {
  value: number;
  label: string;
  s: number;
}) {
  return (
    <View style={styles.count}>
      <Text
        allowFontScaling={false}
        style={[styles.countValue, { fontSize: 32 * s, lineHeight: 36 * s }]}
      >
        {value}
      </Text>
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={[styles.countLabel, { fontSize: 10 * s }]}
      >
        {label}
      </Text>
    </View>
  );
}

export function PassportStoryCard({
  ref,
  story,
  together,
  link,
  year,
  width,
}: {
  ref?: Ref<ComponentRef<typeof View>>;
  story: PassportStory;
  together: number;
  link: string;
  year: string;
  width: number;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const s = width / BASE_WIDTH;
  const height = Math.round((width * 16) / 9);
  const title = story.fromReels
    ? t("passportStory.titleReels", { count: story.places })
    : t("passportStory.titleSaved", { count: story.places });
  return (
    <View
      ref={ref}
      collapsable={false}
      testID="passport-story-card"
      style={[
        styles.card,
        {
          width,
          height,
          paddingTop: 66 * s,
          paddingHorizontal: 24 * s,
          paddingBottom: SAFE_BOTTOM * s,
        },
      ]}
    >
      <View
        style={[
          styles.frame,
          { top: 10 * s, left: 10 * s, right: 10 * s, bottom: 10 * s },
        ]}
      />
      <View style={styles.top}>
        <Text
          allowFontScaling={false}
          style={[styles.wordmark, { fontSize: 22 * s }]}
        >
          shelvr
        </Text>
        <Text
          allowFontScaling={false}
          style={[styles.kicker, { fontSize: 11 * s }]}
        >
          {t("passportStory.kicker", { year })}
        </Text>
      </View>
      <Text
        allowFontScaling={false}
        numberOfLines={2}
        adjustsFontSizeToFit
        style={[
          styles.title,
          { fontSize: 30 * s, lineHeight: 33 * s, marginTop: 12 * s },
        ]}
      >
        {title}
      </Text>
      <View
        style={[styles.counts, { marginTop: 14 * s, paddingVertical: 8 * s }]}
      >
        <Count value={story.places} label={t("passport.places")} s={s} />
        <Count value={story.cities} label={t("passport.cities")} s={s} />
        {story.countries !== null ? (
          <Count
            value={story.countries}
            label={t("passport.countries")}
            s={s}
          />
        ) : null}
      </View>
      <Collage
        story={story}
        s={s * (together > 0 ? WITH_TOGETHER : COLLAGE_SCALE)}
      />
      {together > 0 ? (
        <View
          testID="passport-story-together"
          style={[
            styles.together,
            {
              marginTop: 14 * s,
              gap: 8 * s,
              paddingHorizontal: 12 * s,
              paddingVertical: 9 * s,
              borderRadius: 12 * s,
            },
          ]}
        >
          <View style={styles.dots}>
            <View
              style={[
                styles.dot,
                styles.dotFront,
                { width: 16 * s, height: 16 * s, borderRadius: 8 * s },
              ]}
            />
            <View
              style={[
                styles.dot,
                styles.dotBack,
                {
                  width: 16 * s,
                  height: 16 * s,
                  borderRadius: 8 * s,
                  marginLeft: -6 * s,
                },
              ]}
            />
          </View>
          <Text
            allowFontScaling={false}
            style={[styles.togetherText, { fontSize: 13 * s }]}
          >
            {t("passportStory.together", { count: together })}
          </Text>
        </View>
      ) : null}
      <View style={styles.footer}>
        <View style={styles.footerText}>
          <Text
            allowFontScaling={false}
            style={[styles.tagline, { fontSize: 20 * s, lineHeight: 23 * s }]}
          >
            {t("passportStory.tagline")}
          </Text>
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.7}
            style={[styles.scan, { fontSize: 10 * s, marginTop: 6 * s }]}
          >
            {t("passportStory.scan")}
          </Text>
        </View>
        <QrCode
          value={link}
          size={72 * s}
          color={theme.colors.foreground}
          background={theme.colors.surface}
          radius={6 * s}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: { overflow: "hidden", backgroundColor: theme.colors.background },
  frame: {
    position: "absolute",
    borderWidth: 1.5,
    borderRadius: 12,
    borderColor: theme.colors.border,
  },
  top: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  wordmark: {
    fontFamily: theme.type.displayTitle.fontFamily,
    color: theme.colors.foreground,
  },
  kicker: {
    ...theme.type.labelStrong,
    color: theme.colors.primaryText,
    textTransform: "uppercase",
    letterSpacing: 1.6,
  },
  title: {
    fontFamily: theme.type.displayTitle.fontFamily,
    color: theme.colors.foreground,
  },
  counts: {
    flexDirection: "row",
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: theme.colors.border,
  },
  count: { flex: 1, alignItems: "center" },
  countValue: {
    fontFamily: theme.type.displayTitle.fontFamily,
    color: theme.colors.foreground,
  },
  countLabel: {
    ...theme.type.labelStrong,
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.4,
  },
  more: {
    position: "absolute",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 20,
    borderColor: theme.colors.primaryText,
    backgroundColor: theme.colors.background,
    transform: [{ rotate: "-4deg" }],
  },
  moreText: { ...theme.type.labelStrong, color: theme.colors.primaryText },
  together: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  dots: { flexDirection: "row" },
  dot: { borderWidth: 2, borderColor: theme.colors.primarySoft },
  dotFront: { backgroundColor: theme.colors.primaryText },
  dotBack: { backgroundColor: theme.colors.muted },
  togetherText: {
    flexShrink: 1,
    ...theme.type.labelStrong,
    color: theme.colors.foreground,
  },
  footer: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
  },
  footerText: { flexShrink: 1 },
  tagline: {
    fontFamily: theme.type.displayTitle.fontFamily,
    color: theme.colors.foreground,
  },
  scan: {
    ...theme.type.labelStrong,
    color: theme.colors.muted,
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
}));
