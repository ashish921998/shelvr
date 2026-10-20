import {
  PinBadge,
  SampleTripMap,
} from "@/components/onboarding/sample-trip-map";
import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import {
  SAMPLE_CROPS,
  SAMPLE_SLOT_LABELS,
  SAMPLE_TRIP,
  sampleStops,
  type NumberedStop,
} from "@/lib/sample-trip";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The sample trip as a card: the map, then each day's stops. Locked, the card
// shows the first stop clearly and veils the rest behind a lock.

/** Rows shown clearly on the locked card: day one's header and first stop. */
const CLEAR_ROWS = 2;

type Row = { kind: "day"; day: number } | { kind: "stop"; entry: NumberedStop };

/** The card's rows top to bottom: each day's header, then its stops. */
function cardRows(): Row[] {
  const stops = sampleStops();
  return SAMPLE_TRIP.days.flatMap((_, day) => [
    { kind: "day" as const, day },
    ...stops
      .filter((entry) => entry.day === day)
      .map((entry) => ({ kind: "stop" as const, entry })),
  ]);
}

function DayHeader({
  day,
  divider,
  veiled,
}: {
  day: number;
  divider: boolean;
  veiled: boolean;
}) {
  const { title, stops } = SAMPLE_TRIP.days[day];
  return (
    <View style={[styles.dayHeader, divider && styles.divider]}>
      <View style={styles.dayText}>
        <Text style={[styles.dayEyebrow, veiled && styles.veilAccent]}>
          {t("trip.dayTab", { day: String(day + 1) })}
        </Text>
        <Text style={[styles.dayTitle, veiled && styles.veilInk]}>
          {t(title)}
        </Text>
      </View>
      <Text style={[styles.dayCount, veiled && styles.veilMuted]}>
        {t("tripTeaser.placeCount", { count: stops.length })}
      </Text>
    </View>
  );
}

function StopRow({
  entry,
  divider,
  veiled,
}: {
  entry: NumberedStop;
  divider: boolean;
  veiled: boolean;
}) {
  return (
    <View style={[styles.stopRow, divider && styles.divider]}>
      <Text style={[styles.slot, veiled && styles.veilMuted]} numberOfLines={1}>
        {t(SAMPLE_SLOT_LABELS[entry.stop.slot])}
      </Text>
      <Text
        style={[styles.stopName, veiled && styles.veilInk]}
        numberOfLines={1}
      >
        {entry.stop.name}
      </Text>
      <PinBadge number={entry.number} day={entry.day} veiled={veiled} />
    </View>
  );
}

function CardRow({
  row,
  divider,
  veiled,
}: {
  row: Row;
  divider: boolean;
  veiled: boolean;
}) {
  return row.kind === "day" ? (
    <DayHeader day={row.day} divider={divider} veiled={veiled} />
  ) : (
    <StopRow entry={row.entry} divider={divider} veiled={veiled} />
  );
}

/** Rows behind a lock: the same rows, blurred and hidden from screen readers,
 * with one lock over their middle. */
function VeiledRows({ rows }: { rows: Row[] }) {
  const { theme } = useUnistyles();
  return (
    <View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {rows.map((row, index) => (
          <CardRow key={index} row={row} divider veiled />
        ))}
      </View>
      <View
        style={styles.lock}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t("tripTeaser.lockedLabel")}
      >
        <AppSymbolIcon
          name="lock"
          size={18}
          weight="medium"
          tintColor={theme.colors.foreground}
        />
      </View>
    </View>
  );
}

/**
 * The sample trip. With `locked`, only the first stop is clear; the rest is
 * veiled behind a lock.
 */
export function SampleTripCard({ locked }: { locked: boolean }) {
  useAppLocale();
  const rows = cardRows();
  const clear = locked ? rows.slice(0, CLEAR_ROWS) : rows;
  const veiled = locked ? rows.slice(CLEAR_ROWS) : [];
  return (
    <View style={styles.card}>
      <View>
        <SampleTripMap
          crop={locked ? SAMPLE_CROPS.locked : SAMPLE_CROPS.reveal}
        />
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{t("tripTeaser.sampleBadge")}</Text>
        </View>
      </View>
      {clear.map((row, index) => (
        <CardRow key={index} row={row} divider={index > 0} veiled={false} />
      ))}
      {veiled.length > 0 ? <VeiledRows rows={veiled} /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  card: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  badge: {
    position: "absolute",
    top: 10,
    left: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  badgeText: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.muted,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  dayHeader: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: theme.gap(1),
    paddingTop: 14,
    paddingBottom: theme.gap(1),
    paddingHorizontal: theme.gap(2),
  },
  dayText: {
    flex: 1,
    gap: 2,
  },
  dayEyebrow: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  dayTitle: {
    ...theme.type.header,
    lineHeight: 24,
    color: theme.colors.foreground,
  },
  dayCount: {
    ...theme.type.caption,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  stopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    minHeight: 44,
    paddingHorizontal: theme.gap(2),
  },
  slot: {
    width: 84,
    ...theme.type.label,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  stopName: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.foreground,
  },
  // Blurred text: the glyphs are clear and their shadow is not, so what is
  // left is a soft smudge in the text's own color.
  veilInk: {
    color: "transparent",
    textShadowColor: theme.colors.foreground,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  veilMuted: {
    color: "transparent",
    textShadowColor: theme.colors.muted,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  veilAccent: {
    color: "transparent",
    textShadowColor: theme.colors.primaryText,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  lock: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 44,
    height: 44,
    marginTop: -22,
    marginLeft: -22,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.foreground,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
}));
