import {
  PinBadge,
  SampleTripMap,
} from "@/components/onboarding/sample-trip-map";
import { VeiledStops } from "@/components/onboarding/veiled-stops";
import { AppSymbolIcon } from "@/components/symbol";
import { t, useAppLocale } from "@/lib/i18n";
import {
  SAMPLE_CROPS,
  SAMPLE_SLOT_LABELS,
  sampleRows,
  type NumberedStop,
  type SampleRow,
  type SampleTrip,
} from "@/lib/sample-trip";
import { Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The sample trip as a card: the map, then each day's stops. Locked, the card
// shows the first stop clearly and veils the rest behind a lock.

/** Rows shown clearly on the locked card: day one's header and first stop. */
const CLEAR_ROWS = 2;

function DayHeader({
  row: { day, title, places },
  divider,
}: {
  row: Extract<SampleRow, { kind: "day" }>;
  divider: boolean;
}) {
  return (
    <View style={[styles.dayHeader, divider && styles.divider]}>
      <View style={styles.dayText}>
        <Text style={styles.dayEyebrow}>
          {t("trip.dayTab", { day: String(day + 1) })}
        </Text>
        <Text style={styles.dayTitle}>{t(title)}</Text>
      </View>
      <Text style={styles.dayCount}>
        {t("tripTeaser.placeCount", { count: places })}
      </Text>
    </View>
  );
}

function StopRow({
  entry,
  divider,
}: {
  entry: NumberedStop;
  divider: boolean;
}) {
  return (
    <View style={[styles.stopRow, divider && styles.divider]}>
      <Text style={styles.slot} numberOfLines={1}>
        {t(SAMPLE_SLOT_LABELS[entry.stop.slot])}
      </Text>
      <Text style={styles.stopName} numberOfLines={1}>
        {entry.stop.name}
      </Text>
      <PinBadge number={entry.number} day={entry.day} />
    </View>
  );
}

function CardRow({ row, divider }: { row: SampleRow; divider: boolean }) {
  return row.kind === "day" ? (
    <DayHeader row={row} divider={divider} />
  ) : (
    <StopRow entry={row.entry} divider={divider} />
  );
}

/** Rows behind a lock: the same rows, blurred and hidden from screen readers,
 * with one lock over their middle. */
function VeiledRows({ rows }: { rows: SampleRow[] }) {
  const { theme } = useUnistyles();
  return (
    <View>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <VeiledStops rows={rows} />
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
export function SampleTripCard({
  trip,
  locked,
}: {
  trip: SampleTrip;
  locked: boolean;
}) {
  useAppLocale();
  const rows = sampleRows(trip);
  const clear = locked ? rows.slice(0, CLEAR_ROWS) : rows;
  const veiled = locked ? rows.slice(CLEAR_ROWS) : [];
  return (
    <View style={styles.card}>
      <View>
        <SampleTripMap
          trip={trip}
          crop={locked ? SAMPLE_CROPS.locked : SAMPLE_CROPS.reveal}
        />
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{t("tripTeaser.sampleBadge")}</Text>
        </View>
      </View>
      {clear.map((row, index) => (
        <CardRow key={index} row={row} divider={index > 0} />
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
