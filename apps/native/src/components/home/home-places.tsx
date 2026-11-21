import { CityCover, type CoverLayout } from "@/components/city/city-cover";
import { HomeSectionHeading } from "@/components/home/home-section-heading";
import { useSaveGuard } from "@/lib/free-plan";
import {
  type City,
  cityCountLine,
  cityRows,
  saveSource,
  unplacedSaves,
  visibleCities,
} from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { useHomeCities } from "@/lib/use-home-cities";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";

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

export function CityGrid({ cities }: { cities: City[] }) {
  const only = cities.length === 1;
  return (
    <View style={styles.grid}>
      {cityRows(cities).map((row) =>
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
  const { guard } = useSaveGuard("home");
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
  const router = useRouter();
  const { data: cities } = useHomeCities();
  if (cities === undefined) return null;
  if (cities.length === 0) {
    return (
      <View style={styles.container}>
        <HomePlacesEmptyCard />
      </View>
    );
  }
  const { shown, hidden } = visibleCities(cities);
  return (
    <View style={styles.container}>
      <HomeSectionHeading
        title={t("homePlaces.yourCities")}
        action={
          hidden > 0
            ? {
                label: t("homePlaces.moreCities", { n: String(hidden) }),
                onPress: () => router.push("/cities"),
              }
            : undefined
        }
      />
      <CityGrid cities={shown} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1.5),
  },
  grid: { gap: theme.gap(2) },
  pair: { flexDirection: "row", gap: theme.gap(1.5) },
  half: { flex: 1 },
  pressed: { opacity: theme.opacity.pressed },
  moreLabel: { ...theme.type.subheadStrong, color: theme.colors.foreground },
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
