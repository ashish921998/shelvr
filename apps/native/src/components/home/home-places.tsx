import { CityCover, type CoverLayout } from "@/components/city/city-cover";
import { HomeRow } from "@/components/home/home-row";
import { PlanCitySheet } from "@/components/home/plan-city-sheet";
import { ReviewSaves, type ReviewSave } from "@/components/home/review-saves";
import { SharedListsSection } from "@/components/home/shared-lists-section";
import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { withAlpha } from "@/lib/color";
import { type CityPlanKind, useCityPlan } from "@/lib/city-plan";
import { canBrowse } from "@/lib/access";
import { useAccess, useSaveGuard } from "@/lib/free-plan";
import {
  type City,
  cityCountLine,
  cityRows,
  plannableCities,
  saveSource,
  unplacedSaves,
  visibleCities,
} from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

function CityCard({
  entry,
  layout,
  style,
}: {
  entry: City;
  layout: CoverLayout;
  style?: ViewStyle;
}) {
  const router = useRouter();
  const count = cityCountLine(entry);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count ? `${entry.city}, ${count}` : entry.city}
      onPress={() =>
        router.push({ pathname: "/city/[name]", params: { name: entry.city } })
      }
      style={({ pressed }) => [style, pressed && styles.pressed]}
    >
      <CityCover entry={entry} layout={layout} />
    </Pressable>
  );
}

function CityGrid({ cities }: { cities: City[] }) {
  const { theme } = useUnistyles();
  const [expanded, setExpanded] = useState(false);
  const { shown, hidden } = visibleCities(cities, expanded);
  const only = cities.length === 1;
  return (
    <View style={styles.cities}>
      <View style={styles.heading}>
        <ThemedText variant="title" accessibilityRole="header">
          {t("homePlaces.yourCities")}
        </ThemedText>
        {hidden > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("homePlaces.seeAll")}
            hitSlop={12}
            onPress={() => setExpanded(true)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <ThemedText variant="subheadLabel" style={styles.seeAll}>
              {t("homePlaces.seeAll")}
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {cityRows(shown).map((row) =>
        row.kind === "pair" ? (
          <View key={row.cities[0].city} style={styles.pair}>
            {row.cities.map((entry) => (
              <CityCard
                key={entry.city}
                entry={entry}
                layout="pair"
                style={styles.half}
              />
            ))}
          </View>
        ) : (
          <CityCard
            key={row.city.city}
            entry={row.city}
            layout={only ? "only" : "wide"}
          />
        ),
      )}
      {only ? (
        <View style={styles.tip}>
          <AppSymbolIcon
            name="plus"
            size={18}
            tintColor={theme.colors.primaryText}
          />
          <Text style={styles.tipText}>{t("homePlaces.shareTip")}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PlanRows({ cities, pro }: { cities: City[]; pro: boolean }) {
  const { busy, start } = useCityPlan();
  const [picking, setPicking] = useState<{ kind: CityPlanKind; open: boolean }>(
    { kind: "date", open: false },
  );
  const [only] = cities;
  if (!only) return null;
  const subtitle =
    cities.length === 1
      ? t("homePlaces.planInCity", { city: only.city })
      : t("homePlaces.planPickCity");
  const press = (kind: CityPlanKind) =>
    cities.length === 1
      ? void start(kind, only.city)
      : setPicking({ kind, open: true });
  const proTag = t("freePlan.proTag");
  return (
    <>
      {(["date", "trip"] as const).map((kind) => {
        const title = t(
          kind === "date" ? "homePlaces.planDate" : "homePlaces.planTrip",
        );
        return (
          <HomeRow
            key={kind}
            icon={kind === "date" ? "heart.fill" : "airplane"}
            title={title}
            value={subtitle}
            tag={pro ? undefined : proTag}
            label={
              pro ? `${title}, ${subtitle}` : `${title}, ${subtitle}, ${proTag}`
            }
            disabled={busy !== null}
            onPress={() => press(kind)}
          />
        );
      })}
      <PlanCitySheet
        visible={picking.open}
        kind={picking.kind}
        cities={cities}
        onClose={() => setPicking({ ...picking, open: false })}
        onPick={(city) => void start(picking.kind, city)}
      />
    </>
  );
}

const MAX_UNPLACED_ROWS = 5;

type UnplacedSave = {
  _id: string;
  status: "processing" | "ready" | "failed";
  cities?: string[];
  title?: string;
  url?: string;
  siteName?: string;
};

function UnplacedSection({
  saves,
  title,
}: {
  saves: UnplacedSave[];
  title: string;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const unplaced = expanded ? saves : saves.slice(0, MAX_UNPLACED_ROWS);
  const hidden = saves.length - unplaced.length;
  if (saves.length === 0) return null;
  return (
    <View style={styles.unplaced}>
      <Text style={styles.sectionLabel}>{title}</Text>
      {unplaced.map((save) => (
        <Pressable
          key={save._id}
          accessibilityRole="button"
          accessibilityLabel={`${save.title ?? saveSource(save)}, ${title}`}
          onPress={() =>
            router.push({
              pathname: "/item/[id]",
              params: { id: save._id, from: "home" },
            })
          }
          style={({ pressed }) => [
            styles.unplacedRow,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.unplacedTitle} numberOfLines={1}>
            {save.title ?? saveSource(save)}
          </Text>
        </Pressable>
      ))}
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [styles.showAll, pressed && styles.pressed]}
        >
          <Text style={styles.moreLabel}>
            {t("homePlaces.moreCities", { n: String(hidden) })}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Saves still being read. Failed and placeless saves wait behind one line (`ReviewSaves`). */
export function UnplacedSaves({ saves }: { saves: UnplacedSave[] }) {
  useAppLocale();
  return (
    <UnplacedSection
      saves={unplacedSaves(saves).filter(
        (save) => save.status === "processing",
      )}
      title={t("homePlaces.noPlaceReading")}
    />
  );
}

/** The places pitch for an empty shelf; Home shows it before the first save. */
export function HomePlacesEmptyCard() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const { guard } = useSaveGuard("home");
  return (
    <View style={styles.card}>
      <View style={styles.cardIcon}>
        <AppSymbolIcon
          name="mappin"
          size={26}
          tintColor={theme.colors.primaryText}
        />
      </View>
      <ThemedText variant="title" style={styles.centered}>
        {t("homePlaces.emptyTitle")}
      </ThemedText>
      <ThemedText variant="subhead" style={[styles.centered, styles.muted]}>
        {t("homePlaces.emptyBody")}
      </ThemedText>
      <Button
        title={t("homePlaces.addSpot")}
        onPress={() => void guard(() => router.push("/add"))}
        style={styles.cardButton}
      />
    </View>
  );
}

export function HomePlaces({ saves }: { saves: ReviewSave[] }) {
  useAppLocale();
  const access = useAccess();
  const browsing = canBrowse(access);
  const cities = useQuery(
    convexQuery(api.items.listCities, browsing ? {} : "skip"),
  );
  const loaded = browsing ? cities.data : undefined;
  return (
    <>
      <View style={styles.rows}>
        {loaded ? (
          <PlanRows
            cities={plannableCities(loaded)}
            pro={access.kind === "pro"}
          />
        ) : null}
        <ReviewSaves saves={saves} />
      </View>
      <SharedListsSection />
      {loaded?.length === 0 ? (
        <View style={styles.emptyCities}>
          <HomePlacesEmptyCard />
        </View>
      ) : null}
      {loaded && loaded.length > 0 ? <CityGrid cities={loaded} /> : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  rows: { paddingHorizontal: theme.gap(2) },
  cities: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(3),
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(1),
  },
  seeAll: { color: theme.colors.primaryText },
  emptyCities: { paddingHorizontal: theme.gap(2), paddingTop: theme.gap(3) },
  pair: { flexDirection: "row", gap: theme.gap(1.5) },
  half: { flex: 1 },
  pressed: { opacity: theme.opacity.pressed },
  moreLabel: { ...theme.type.subheadStrong, color: theme.colors.foreground },
  tip: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  tipText: { flex: 1, ...theme.type.footnote, color: theme.colors.muted },
  muted: { color: theme.colors.muted },
  unplaced: {
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(3),
  },
  sectionLabel: {
    ...theme.type.labelStrong,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.faint,
  },
  unplacedRow: {
    gap: theme.gap(0.25),
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  showAll: { paddingVertical: theme.gap(1.25) },
  unplacedTitle: {
    ...theme.type.subheadStrong,
    color: theme.colors.foreground,
  },
  card: {
    alignItems: "center",
    gap: theme.gap(1.25),
    paddingHorizontal: theme.gap(2.5),
    paddingTop: theme.gap(3.5),
    paddingBottom: theme.gap(3),
    borderRadius: theme.radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: withAlpha(theme.colors.muted, 0.5),
    backgroundColor: theme.colors.surfaceMuted,
  },
  cardIcon: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: theme.colors.primarySoft,
  },
  centered: { textAlign: "center" },
  cardButton: { alignSelf: "stretch", marginTop: theme.gap(1) },
}));
