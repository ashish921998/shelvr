import { CityCover, type CoverLayout } from "@/components/city/city-cover";
import { PlanCitySheet } from "@/components/home/plan-city-sheet";
import { AppSymbolIcon } from "@/components/symbol";
import { type CityPlanKind, useCityPlan } from "@/lib/city-plan";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
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
    <View style={styles.grid}>
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
      {hidden > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("homePlaces.moreCities", { n: String(hidden) })}
          onPress={() => setExpanded(true)}
          style={({ pressed }) => [styles.more, pressed && styles.pressed]}
        >
          <Text style={styles.moreLabel}>
            {t("homePlaces.moreCities", { n: String(hidden) })}
          </Text>
        </Pressable>
      ) : null}
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

function PlanTile({
  kind,
  subtitle,
  disabled,
  onPress,
}: {
  kind: CityPlanKind;
  subtitle: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const title = t(
    kind === "date" ? "homePlaces.planDate" : "homePlaces.planTrip",
  );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <View style={styles.tileIcon}>
        <AppSymbolIcon
          name={kind === "date" ? "heart" : "airplane"}
          size={18}
          tintColor={theme.colors.primaryText}
        />
      </View>
      <View style={styles.tileText}>
        <Text style={styles.tileTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.tileSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </Pressable>
  );
}

function PlanTiles({ cities }: { cities: City[] }) {
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
  return (
    <View style={styles.pair}>
      {(["date", "trip"] as const).map((kind) => (
        <View key={kind} style={styles.half}>
          <PlanTile
            kind={kind}
            subtitle={subtitle}
            disabled={busy !== null}
            onPress={() => press(kind)}
          />
        </View>
      ))}
      <PlanCitySheet
        visible={picking.open}
        kind={picking.kind}
        cities={cities}
        onClose={() => setPicking({ ...picking, open: false })}
        onPick={(city) => void start(picking.kind, city)}
      />
    </View>
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
  const { guard } = usePaywallGuard("home");
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{t("homePlaces.emptyTitle")}</Text>
      <Text style={styles.muted}>{t("homePlaces.emptyBody")}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("homePlaces.addSpot")}
        onPress={() => void guard(() => router.push("/add"))}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <Text style={styles.buttonLabel}>{t("homePlaces.addSpot")}</Text>
      </Pressable>
    </View>
  );
}

export function HomePlaces() {
  useAppLocale();
  const { entitled } = useEntitlement();
  const cities = useQuery(
    convexQuery(api.items.listCities, entitled ? {} : "skip"),
  );
  if (!entitled || cities.data === undefined) return null;
  if (cities.data.length === 0) {
    return (
      <View style={styles.container}>
        <HomePlacesEmptyCard />
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <PlanTiles cities={plannableCities(cities.data)} />
      <CityGrid cities={cities.data} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1.5),
  },
  grid: { gap: theme.gap(1.5) },
  pair: { flexDirection: "row", gap: theme.gap(1.5) },
  half: { flex: 1 },
  pressed: { opacity: theme.opacity.pressed },
  more: {
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  moreLabel: { ...theme.type.subheadStrong, color: theme.colors.foreground },
  tile: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    paddingVertical: theme.gap(1.25),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  tileIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    backgroundColor: theme.colors.primarySoft,
  },
  tileText: { flex: 1 },
  tileTitle: { ...theme.type.subheadLabel, color: theme.colors.foreground },
  tileSubtitle: { ...theme.type.caption, color: theme.colors.muted },
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
  muted: { ...theme.type.footnote, color: theme.colors.muted },
  unplaced: {
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(2),
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
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cardTitle: { ...theme.type.title, color: theme.colors.foreground },
  button: {
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(3),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
  },
  buttonLabel: { ...theme.type.button, color: theme.colors.surface },
}));
