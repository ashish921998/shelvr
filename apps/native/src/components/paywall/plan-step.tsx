import { AppSymbolIcon } from "@/components/symbol";
import { formattingLocale, t } from "@/lib/i18n";
import { planCopy, type Plan, type TimelineRow } from "@/lib/paywall-plans";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { StepHeading } from "./parts";

export type PlanPrices = {
  /** Store-formatted prices, e.g. "$39.99". */
  annual: string;
  monthly: string;
  /** The annual price over twelve months, in the store's currency. */
  perMonth: string;
  savePct: number | null;
};

const APP_ICON = require("../../../assets/icon.png");

/** "Oct 7" in the user's locale. */
export function shortDate(ms: number): string {
  return new Date(ms).toLocaleDateString(formattingLocale(), {
    month: "short",
    day: "numeric",
  });
}

/** Step 2: the two plan cards and the timeline for the selected plan. */
export function PlanStep({
  plan,
  trial,
  prices,
  now,
  onSelect,
}: {
  plan: Plan;
  trial: boolean;
  prices: PlanPrices;
  now: number;
  onSelect: (plan: Plan) => void;
}) {
  const copy = planCopy(plan, trial, now);
  return (
    <View>
      <StepHeading
        eyebrow={t("paywall.planEyebrow")}
        title={t(copy.titleKey)}
      />
      <View style={styles.cards} accessibilityRole="radiogroup">
        <PlanCard
          selected={plan === "annual"}
          onPress={() => onSelect("annual")}
          badge={
            prices.savePct === null
              ? null
              : t("paywall.savePct", { pct: String(prices.savePct) })
          }
          name={t("paywall.annual")}
          price={prices.annual}
          unit={t("paywall.perYear")}
          detail={t("paywall.annualPerMonth", { price: prices.perMonth })}
          note={trial ? t("paywall.trialIncluded") : t("paywall.cancelAnytime")}
          noteAccent={trial}
        />
        <PlanCard
          selected={plan === "monthly"}
          onPress={() => onSelect("monthly")}
          badge={null}
          name={t("paywall.monthly")}
          price={prices.monthly}
          unit={t("paywall.perMonth")}
          detail={t("paywall.cancelAnytime")}
          note={t("paywall.noTrial")}
          noteAccent={false}
        />
      </View>
      <View style={styles.timeline}>
        {copy.timeline.map((row, index) => (
          <TimelineItem
            key={`${plan}-${trial}-${index}`}
            row={row}
            last={index === copy.timeline.length - 1}
            prices={prices}
            onAnnual={() => onSelect("annual")}
          />
        ))}
      </View>
    </View>
  );
}

function PlanCard({
  selected,
  onPress,
  badge,
  name,
  price,
  unit,
  detail,
  note,
  noteAccent,
}: {
  selected: boolean;
  onPress: () => void;
  badge: string | null;
  name: string;
  price: string;
  unit: string;
  detail: string;
  note: string;
  noteAccent: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, checked: selected }}
      accessibilityLabel={[badge, name, `${price}${unit}`, detail, note]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={styles.cardPressable}
    >
      <Animated.View style={styles.card(selected)}>
        <View style={styles.cardRow}>
          <Text style={styles.cardName} numberOfLines={1}>
            {name}
          </Text>
          <Animated.View style={styles.radio(selected)}>
            <Animated.View style={styles.radioDot(selected)} />
          </Animated.View>
        </View>
        <Text style={styles.priceRow} numberOfLines={1} adjustsFontSizeToFit>
          <Text style={styles.price}>{price}</Text>
          <Text style={styles.unit}> {unit}</Text>
        </Text>
        <Text style={styles.cardDetail}>{detail}</Text>
        <Text style={styles.cardNote(noteAccent)}>{note}</Text>
      </Animated.View>
      {badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

function TimelineItem({
  row,
  last,
  prices,
  onAnnual,
}: {
  row: TimelineRow;
  last: boolean;
  prices: PlanPrices;
  onAnnual: () => void;
}) {
  const { theme } = useUnistyles();
  const date = row.date === null ? "" : shortDate(row.date);
  const dateLine = timelineDate(row, date);
  const headline = timelineHeadline(row, prices);
  const iconTint =
    row.tone === "primary"
      ? theme.colors.primaryForeground
      : row.tone === "soft"
        ? theme.colors.primaryText
        : theme.colors.muted;
  return (
    <View style={styles.row}>
      <View style={styles.iconColumn}>
        <View style={styles.circle(row.tone)}>
          <AppSymbolIcon name={row.icon} size={17} tintColor={iconTint} />
        </View>
        {last ? null : (
          <View style={styles.connector(row.tone === "primary")} />
        )}
      </View>
      <View style={styles.rowText(last)}>
        <Text style={styles.dateLine(row.tone === "primary")}>{dateLine}</Text>
        <Text style={styles.headline}>{headline}</Text>
        {row.reminder && row.date !== null ? (
          <ReminderMock date={date} />
        ) : null}
        {row.annualChip ? (
          <Pressable
            accessibilityRole="button"
            onPress={onAnnual}
            style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
          >
            <AppSymbolIcon
              name="sparkles"
              size={15}
              tintColor={theme.colors.primaryText}
            />
            <Text style={styles.chipText}>{t("paywall.annualChip")}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function timelineDate(row: TimelineRow, date: string): string {
  switch (row.dateKey) {
    case "paywall.dateDay":
      return t("paywall.dateDay", { day: String(row.day ?? 0), date });
    case "paywall.dateAnyTime":
      return t("paywall.dateAnyTime");
    default:
      return t(row.dateKey, { date });
  }
}

function timelineHeadline(row: TimelineRow, prices: PlanPrices): string {
  const price = row.price === "monthly" ? prices.monthly : prices.annual;
  switch (row.headlineKey) {
    case "paywall.trialCharge":
    case "paywall.billedToday":
    case "paywall.renews":
      return t(row.headlineKey, { price });
    case "paywall.switchAnnual":
      return t("paywall.switchAnnual", {
        price: prices.annual,
        perMonth: prices.perMonth,
      });
    default:
      return t(row.headlineKey);
  }
}

/**
 * The day-5 reminder as it will arrive: the same title and body
 * `lib/trial-reminder.ts` schedules, from the same catalog keys.
 */
function ReminderMock({ date }: { date: string }) {
  return (
    <View>
      <View style={styles.mock}>
        <Image source={APP_ICON} style={styles.mockIcon} />
        <View style={styles.mockText}>
          <View style={styles.mockTop}>
            <Text style={styles.mockTitle} numberOfLines={2}>
              {t("notifications.trialEndingTitle")}
            </Text>
            <Text style={styles.mockDate}>{date}</Text>
          </View>
          <Text style={styles.mockBody}>
            {t("notifications.trialEndingBody")}
          </Text>
        </View>
      </View>
      <Text style={styles.reminderNote}>{t("paywall.reminderNote")}</Text>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  cards: { marginTop: 28, flexDirection: "row", gap: 10 },
  cardPressable: { flex: 1 },
  card: (selected: boolean) => ({
    flex: 1,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    paddingTop: 14,
    paddingHorizontal: 14,
    paddingBottom: 12,
    gap: 4,
    borderWidth: 2,
    borderColor: selected ? theme.colors.primary : theme.colors.border,
    backgroundColor: selected ? theme.colors.primarySoft : theme.colors.surface,
    transitionProperty: ["borderColor", "backgroundColor"],
    transitionDuration: 200,
  }),
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  cardName: {
    flexShrink: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.foreground,
  },
  radio: (selected: boolean) => ({
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: selected ? theme.colors.primary : theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    transitionProperty: "borderColor",
    transitionDuration: 200,
  }),
  radioDot: (selected: boolean) => ({
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: selected ? theme.colors.primary : "transparent",
    transitionProperty: "backgroundColor",
    transitionDuration: 200,
  }),
  priceRow: { marginTop: 2 },
  price: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    letterSpacing: -0.3,
    color: theme.colors.foreground,
  },
  unit: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
  },
  cardDetail: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 17,
    color: theme.colors.muted,
  },
  cardNote: (accent: boolean) => ({
    fontFamily: accent ? theme.fonts.medium : theme.fonts.regular,
    fontSize: 13,
    lineHeight: 17,
    color: accent ? theme.colors.primaryText : theme.colors.muted,
  }),
  badge: {
    position: "absolute",
    top: -10,
    left: 12,
    backgroundColor: theme.colors.primary,
    borderRadius: 50,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  badgeText: {
    fontFamily: theme.fonts.bold,
    fontSize: 12,
    lineHeight: 14,
    color: theme.colors.primaryForeground,
  },
  timeline: { marginTop: 26 },
  row: { flexDirection: "row", gap: 14 },
  iconColumn: { width: 32, alignItems: "center" },
  circle: (tone: TimelineRow["tone"]) => ({
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor:
      tone === "primary"
        ? theme.colors.primary
        : tone === "soft"
          ? theme.colors.primarySoft
          : theme.colors.surfaceMuted,
    borderWidth: tone === "muted" ? 1 : 0,
    borderColor: theme.colors.border,
  }),
  connector: (filled: boolean) => ({
    flex: 1,
    width: 2,
    marginVertical: 5,
    borderRadius: 1,
    backgroundColor: filled ? theme.colors.primary : theme.colors.border,
  }),
  rowText: (last: boolean) => ({
    flex: 1,
    paddingBottom: last ? 0 : 18,
  }),
  dateLine: (accent: boolean) => ({
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: accent ? theme.colors.primaryText : theme.colors.muted,
  }),
  headline: {
    marginTop: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    lineHeight: 20,
    color: theme.colors.foreground,
  },
  mock: {
    marginTop: 10,
    flexDirection: "row",
    gap: 10,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: theme.colors.primaryForeground,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  mockIcon: { width: 30, height: 30, borderRadius: 7 },
  mockText: { flex: 1 },
  mockTop: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  mockTitle: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.foreground,
  },
  mockDate: {
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: theme.colors.faint,
  },
  mockBody: {
    marginTop: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    lineHeight: 16,
    color: theme.colors.muted,
  },
  reminderNote: {
    marginTop: 6,
    fontFamily: theme.fonts.regular,
    fontSize: 11,
    color: theme.colors.faint,
  },
  chip: {
    marginTop: 10,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 50,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  chipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  pressed: { opacity: 0.85 },
}));
