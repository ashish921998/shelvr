import { Button } from "@/components/ui/button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ThemedText } from "@/components/ui/themed-text";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { useSaveFriendPlaces } from "@/lib/passport-share";
import { api } from "@convex/_generated/api";
import { groupByCity } from "@convex/model/passport";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type Place = { name: string; city?: string };

export function CityNames({
  city,
  names,
  heading = "subheadStrong",
}: {
  city: string | null;
  names: string[];
  heading?: "subheadStrong" | "title";
}) {
  return (
    <View style={styles.card}>
      <ThemedText variant={heading}>
        {city ?? t("passport.elsewhere")}
      </ThemedText>
      {names.map((name, index) => (
        <ThemedText key={`${name}-${index}`} variant="body">
          {name}
        </ThemedText>
      ))}
    </View>
  );
}

function saveTitle(toSave: number, saved: number | null): string {
  if (toSave > 0) return t("passportShare.save", { count: toSave });
  if (saved) return t("passportShare.saved", { count: saved });
  return t("passportShare.savedNone");
}

function Section({
  title,
  places,
  testID,
}: {
  title: string;
  places: Place[];
  testID: string;
}) {
  if (places.length === 0) return null;
  return (
    <View testID={testID} style={styles.section}>
      <View style={styles.sectionHead}>
        <ThemedText variant="title">{title}</ThemedText>
        <ThemedText variant="footnote" style={styles.muted}>
          {places.length}
        </ThemedText>
      </View>
      {groupByCity(places).map(({ city, items }) => (
        <CityNames
          key={city ?? ""}
          city={city}
          names={items.map((place) => place.name)}
        />
      ))}
    </View>
  );
}

export function DeadPassport({ onLeave }: { onLeave: () => void }) {
  useAppLocale();
  return (
    <View style={[styles.content, styles.dead]}>
      <ThemedText variant="title" style={styles.center}>
        {t("passportShare.deadTitle")}
      </ThemedText>
      <ThemedText variant="body" style={[styles.muted, styles.center]}>
        {t("passportShare.deadBody")}
      </ThemedText>
      <Button title={t("sharedLists.backHome")} onPress={onLeave} />
    </View>
  );
}

export function PassportCompare({
  token,
  onLeave,
}: {
  token: string;
  onLeave: () => void;
}) {
  useAppLocale();
  const compare = useQuery(
    convexQuery(api.passportShares.comparePassport, { token }),
  );
  const data = compare.data;
  const friend = useSaveFriendPlaces(token, data?.ownerName);
  const opened = useRef(false);
  useEffect(() => {
    if (!data || opened.current) return;
    opened.current = true;
    analytics.capture("passport_compare_opened", {
      both: data.both.length,
      only_them: data.onlyThem.length,
      only_you: data.onlyYou.length,
    });
  }, [data]);
  useEffect(() => {
    if (compare.error) {
      analytics.captureError("passport_compare_failed", compare.error);
    }
  }, [compare.error]);

  if (data === null || compare.isError) {
    return <DeadPassport onLeave={onLeave} />;
  }
  if (data === undefined) return <ScreenLoader label={t("common.loading")} />;

  const name = data.ownerName;
  const themCount = data.onlyThem.length;
  return (
    <View style={styles.content}>
      <ThemedText variant="largeTitle">
        {t("passportShare.bothHeader", { count: data.both.length })}
      </ThemedText>
      <ThemedText variant="body" style={styles.muted}>
        {name === undefined
          ? t("passportShare.compareSubNoName", {
              onlyYou: String(data.onlyYou.length),
              onlyThem: String(themCount),
            })
          : t("passportShare.compareSub", {
              onlyYou: String(data.onlyYou.length),
              onlyThem: String(themCount),
              name,
            })}
      </ThemedText>
      {themCount > 0 ? (
        <View style={styles.save}>
          <Button
            testID="passport-save-their-places"
            title={saveTitle(data.toSave, friend.saved)}
            loading={friend.busy}
            disabled={data.toSave === 0}
            onPress={() => void friend.save()}
          />
        </View>
      ) : null}
      {data.both.length + themCount + data.onlyYou.length === 0 ? (
        <ThemedText variant="body" style={styles.muted}>
          {t("passportShare.compareEmpty")}
        </ThemedText>
      ) : null}
      <Section
        testID="passport-compare-both"
        title={t("passportShare.both")}
        places={data.both}
      />
      <Section
        testID="passport-compare-them"
        title={
          name === undefined
            ? t("passportShare.onlyThemNoName")
            : t("passportShare.onlyThem", { name })
        }
        places={data.onlyThem}
      />
      <Section
        testID="passport-compare-you"
        title={t("passportShare.onlyYou")}
        places={data.onlyYou}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: { gap: theme.gap(2) },
  muted: { color: theme.colors.muted },
  center: { textAlign: "center" },
  dead: { flexGrow: 1, justifyContent: "center" },
  save: { paddingVertical: theme.gap(0.5) },
  section: { gap: theme.gap(1), paddingTop: theme.gap(1) },
  sectionHead: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: theme.gap(1),
  },
  card: {
    gap: theme.gap(0.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
}));
