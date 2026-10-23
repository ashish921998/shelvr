import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { requestNotificationPermission } from "@/lib/notification-token";
import { useNotificationSession } from "@/lib/notifications";
import {
  applyQueuedWeeklyShelf,
  queueWeeklyShelf,
} from "@/lib/pending-weekly-shelf";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { DEMO_SAMPLES } from "@/lib/onboarding-demo";
import type { Goal } from "@/lib/onboarding-goals";
import { type SampleTrip, sampleStops } from "@/lib/sample-trip";
import type { TextMessageKey } from "@/locales/message-types";
import { useConvexAuth } from "convex/react";
import { Image } from "expo-image";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const APP_ICON = require("../../../assets/icon.png");
const RECIPE_PHOTO = require("../../../assets/onboarding/demo-recipe.jpg");
const ARTICLE_PHOTO = require("../../../assets/onboarding/demo-article.jpg");

const SCRIM =
  "linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 45%, rgba(0,0,0,0) 60%, rgba(0,0,0,0.4) 100%)";

const COPY: Record<
  Goal,
  { title: TextMessageKey; accent: TextMessageKey; body: TextMessageKey }
> = {
  travel: {
    title: "onboardingNotify.travelTitle",
    accent: "onboardingNotify.travelAccent",
    body: "onboardingNotify.placesBody",
  },
  food: {
    title: "onboardingNotify.foodTitle",
    accent: "onboardingNotify.foodAccent",
    body: "onboardingNotify.placesBody",
  },
  date: {
    title: "onboardingNotify.dateTitle",
    accent: "onboardingNotify.dateAccent",
    body: "onboardingNotify.placesBody",
  },
  recipes: {
    title: "onboardingNotify.recipesTitle",
    accent: "onboardingNotify.recipesAccent",
    body: "onboardingNotify.recipesBody",
  },
  other: {
    title: "onboardingNotify.title",
    accent: "onboardingNotify.accent",
    body: "onboardingNotify.body",
  },
};

/** The goals whose screen promises the weekly shelf, so allowing turns it on. */
const SHELF_GOALS: ReadonlySet<Goal> = new Set(["travel", "food", "date"]);

type LockScreen = {
  photo: number;
  /** 0 is Sunday. */
  day: number;
  hour: number;
  title: string;
  body: string;
};

function sampleHeading(kind: "Recipes" | "Articles"): string {
  return DEMO_SAMPLES.find((sample) => sample.kind === kind)?.pageHeading ?? "";
}

/** What their phone would show: the push this goal gets first, over a photo of what they picked. */
function lockScreenFor(goal: Goal, trip: SampleTrip): LockScreen {
  if (goal === "recipes") {
    return {
      photo: RECIPE_PHOTO,
      day: 4,
      hour: 17,
      title: t("reminder.cookTitle"),
      body: t("reminder.cookBody", { title: sampleHeading("Recipes") }),
    };
  }
  if (goal === "other") {
    return {
      photo: ARTICLE_PHOTO,
      day: 2,
      hour: 20,
      title: t("reminder.readTitle"),
      body: t("reminder.readBody", { title: sampleHeading("Articles") }),
    };
  }
  const stop = sampleStops(trip)[0]?.stop.name;
  return {
    photo: CITY_PICTURES[trip.city][goal === "food" ? "food" : "view"],
    day: 0,
    hour: 9,
    title: t("weekly.previewTitle"),
    body:
      stop === undefined
        ? t("weekly.previewFallback")
        : t("weekly.previewBody", { title: stop }),
  };
}

function LockScreenPreview({ screen }: { screen: LockScreen }) {
  // 1 January 2023 was a Sunday.
  const at = new Date(2023, 0, 1 + screen.day, screen.hour);
  const locale = formattingLocale();
  return (
    <View style={styles.phone} accessible accessibilityLabel={screen.body}>
      <Image source={screen.photo} style={styles.fill} contentFit="cover" />
      <View style={[styles.fill, styles.scrim]} />
      <View style={styles.clock}>
        <Text style={styles.day}>
          {new Intl.DateTimeFormat(locale, { weekday: "long" }).format(at)}
        </Text>
        <Text style={styles.time}>
          {new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(at)}
        </Text>
      </View>
      <View style={styles.stack}>
        <View style={styles.ghost} />
        <View style={styles.push}>
          <Image source={APP_ICON} style={styles.icon} />
          <View style={styles.pushText}>
            <View style={styles.pushTop}>
              <Text style={styles.pushTitle} numberOfLines={1}>
                {screen.title}
              </Text>
              <Text style={styles.now}>{t("onboardingNotify.now")}</Text>
            </View>
            <Text style={styles.pushBody} numberOfLines={2}>
              {screen.body}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export function NotificationsStep({
  goal: picked,
  trip,
  leaving,
  onDone,
}: {
  goal: Goal | null;
  /** The sample plan they just saw; its city and first stop dress the preview. */
  trip: SampleTrip;
  leaving: boolean;
  onDone: () => void;
}) {
  useAppLocale();
  const goal = picked ?? "other";
  const copy = COPY[goal];
  const { isAuthenticated } = useConvexAuth();
  const { session } = useNotificationSession();
  const [asking, setAsking] = useState(false);
  // State updates too late to stop a second tap before the next render.
  const inFlight = useRef(false);
  const reported = useRef(false);

  // Not latched: a closed paywall leaves them here to move on again.
  const finish = (action: "allow" | "skip", granted: boolean) => {
    if (!reported.current) {
      reported.current = true;
      analytics.capture("onboarding_notifications", { action, granted });
    }
    onDone();
  };

  const allow = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setAsking(true);
    let granted = false;
    try {
      granted = await requestNotificationPermission();
      if (granted && SHELF_GOALS.has(goal)) {
        queueWeeklyShelf();
        // Already signed in, so no sign-in is coming to apply it.
        if (isAuthenticated) {
          await applyQueuedWeeklyShelf((enabled) =>
            session.setWeeklyShelf(enabled),
          );
        }
      }
    } catch (error) {
      analytics.captureError("onboarding_notifications_failed", error);
    }
    inFlight.current = false;
    setAsking(false);
    finish("allow", granted);
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {t(copy.title)}{" "}
        <Text style={styles.headlineAccent}>{t(copy.accent)}</Text>
      </Text>

      <LockScreenPreview screen={lockScreenFor(goal, trip)} />

      <Text style={styles.body}>{t(copy.body)}</Text>

      <View style={styles.foot}>
        <CtaButton
          label={t("onboardingNotify.allow")}
          onPress={() => void allow()}
          busy={asking || leaving}
        />
        <GhostButton
          label={t("common.notNow")}
          onPress={() => finish("skip", false)}
          disabled={asking || leaving}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  headline: {
    fontFamily: theme.fonts.display,
    fontSize: 30,
    lineHeight: 36,
    color: theme.colors.foreground,
  },
  headlineAccent: {
    color: theme.colors.primaryText,
  },
  phone: {
    flexGrow: 1,
    minHeight: 320,
    borderRadius: 34,
    borderCurve: "continuous",
    overflow: "hidden",
    borderWidth: 6,
    borderColor: theme.colors.foreground,
    backgroundColor: theme.colors.surfaceMuted,
  },
  fill: {
    ...StyleSheet.absoluteFillObject,
  },
  scrim: {
    experimental_backgroundImage: SCRIM,
  },
  clock: {
    alignItems: "center",
    paddingTop: theme.gap(3),
  },
  day: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: "rgba(255,255,255,0.92)",
  },
  time: {
    fontFamily: theme.fonts.bold,
    fontSize: 58,
    lineHeight: 66,
    color: "#FFFFFF",
  },
  stack: {
    marginTop: "auto",
    paddingHorizontal: theme.gap(1.25),
    paddingBottom: theme.gap(2.25),
  },
  ghost: {
    position: "absolute",
    left: theme.gap(3),
    right: theme.gap(3),
    bottom: theme.gap(1.25),
    height: 40,
    borderRadius: 18,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  push: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    padding: theme.gap(1.5),
    borderRadius: 22,
    borderCurve: "continuous",
    backgroundColor: "rgba(250,247,240,0.95)",
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: 9,
  },
  pushText: {
    flex: 1,
    gap: 2,
  },
  pushTop: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.gap(1),
  },
  pushTitle: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  now: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.muted,
  },
  pushBody: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    color: theme.colors.muted,
  },
  foot: {
    gap: theme.gap(0.5),
  },
}));
