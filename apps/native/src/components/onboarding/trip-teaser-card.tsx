import {
  PinBadge,
  SampleTripMap,
} from "@/components/onboarding/sample-trip-map";
import { t, useAppLocale } from "@/lib/i18n";
import {
  SAMPLE_CROPS,
  SAMPLE_SLOT_LABELS,
  sampleRows,
  type NumberedStop,
  type SampleRow,
  type SampleTrip,
} from "@/lib/sample-trip";
import type { TextMessageKey } from "@/locales/message-types";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const SAMPLE_BADGES: Record<SampleTrip["kind"], TextMessageKey> = {
  trip: "tripTeaser.sampleBadge",
  date: "plan.sampleDateBadge",
  weekend: "plan.sampleWeekendBadge",
};

function DayHeader({
  row: { day, title, places },
  divider,
  numbered,
}: {
  row: Extract<SampleRow, { kind: "day" }>;
  divider: boolean;
  numbered: boolean;
}) {
  return (
    <View style={[styles.dayHeader, divider && styles.divider]}>
      <View style={styles.dayText}>
        {numbered ? (
          <Text style={styles.dayEyebrow}>
            {t("trip.dayTab", { day: String(day + 1) })}
          </Text>
        ) : null}
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

function CardRow({
  row,
  divider,
  numbered,
}: {
  row: SampleRow;
  divider: boolean;
  numbered: boolean;
}) {
  return row.kind === "day" ? (
    <DayHeader row={row} divider={divider} numbered={numbered} />
  ) : (
    <StopRow entry={row.entry} divider={divider} />
  );
}

export function SampleTripCard({ trip }: { trip: SampleTrip }) {
  useAppLocale();
  const rows = sampleRows(trip);
  return (
    <View style={styles.card}>
      <View>
        <SampleTripMap trip={trip} crop={SAMPLE_CROPS.reveal} />
        <View style={styles.badge} pointerEvents="none">
          <Text style={styles.badgeText}>{t(SAMPLE_BADGES[trip.kind])}</Text>
        </View>
      </View>
      {rows.map((row, index) => (
        <CardRow
          key={index}
          row={row}
          divider={index > 0}
          numbered={trip.kind === "trip"}
        />
      ))}
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
}));
