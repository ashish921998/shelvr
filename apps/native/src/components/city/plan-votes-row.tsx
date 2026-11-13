import { AskVotesSheet } from "@/components/city/ask-votes-sheet";
import { AppSymbolIcon } from "@/components/symbol";
import { analytics } from "@/lib/analytics";
import type { CityPin } from "@/lib/city-pins";
import { usePaywallGuard } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { fadeIn } from "@/lib/motion";
import {
  shareVoteLink,
  useClock,
  type VoteLink,
  type VotesRow,
  votesRow,
} from "@/lib/plan-votes";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

async function reshare(token: string) {
  try {
    const shared = await shareVoteLink(token);
    analytics.capture("plan_link_reshared", { shared });
  } catch (error) {
    analytics.capture("plan_ask_failed", { reason: "share" });
    analytics.captureError("plan_ask_failed", error);
  }
}

export function CityVotes({
  city,
  pins,
  filtered,
  link,
}: {
  city: string;
  pins: CityPin[];
  filtered: CityPin[];
  link: VoteLink | null | undefined;
}) {
  const now = useClock();
  const { guard, loading } = usePaywallGuard("plan_vote");
  const [sheet, setSheet] = useState({ open: false, round: 0 });
  const seen = useRef(false);
  useEffect(() => {
    if (seen.current || link === null || link === undefined) return;
    seen.current = true;
    analytics.capture("plan_votes_seen", {
      voters: link.voters,
      open: link.expiresAt > now,
    });
  }, [link, now]);

  if (link === undefined) return null;
  const row = votesRow(link, now);
  const openLink = row.kind === "waiting" || row.kind === "votes" ? link : null;
  const onAsk = () =>
    void guard(() => {
      analytics.capture("plan_ask_opened", { has_link: openLink !== null });
      setSheet((current) => ({ open: true, round: current.round + 1 }));
    });

  return (
    <>
      <PlanVotesRow
        row={row}
        disabled={loading}
        onAsk={onAsk}
        onShare={(token) => void reshare(token)}
      />
      {sheet.round > 0 ? (
        <AskVotesSheet
          key={sheet.round}
          visible={sheet.open}
          city={city}
          pins={pins}
          filtered={filtered}
          link={openLink}
          onClose={() => {
            const round = sheet.round;
            setSheet((current) =>
              current.round === round ? { ...current, open: false } : current,
            );
          }}
        />
      ) : null}
    </>
  );
}

function PlanVotesRow({
  row,
  disabled,
  onAsk,
  onShare,
}: {
  row: VotesRow;
  disabled: boolean;
  onAsk: () => void;
  onShare: (token: string) => void;
}) {
  const { theme } = useUnistyles();
  const { token } = row;
  const content = (
    <>
      <View style={styles.icon}>
        <AppSymbolIcon
          name="bubble.right.fill"
          size={18}
          tintColor={theme.colors.primaryText}
        />
      </View>
      <View style={styles.text}>
        <Animated.View key={row.title} entering={fadeIn}>
          <Text style={styles.title} numberOfLines={1}>
            {row.title}
          </Text>
        </Animated.View>
        <Text style={styles.subtitle} numberOfLines={2}>
          {row.subtitle}
        </Text>
      </View>
    </>
  );
  return (
    <Animated.View entering={fadeIn} style={styles.wrap}>
      {token === undefined ? (
        <Pressable
          testID="plan-votes-row"
          accessibilityRole="button"
          accessibilityLabel={row.label}
          accessibilityState={{ disabled }}
          disabled={disabled}
          onPress={onAsk}
          style={({ pressed }) => [
            styles.row,
            pressed && styles.pressed,
            disabled && styles.disabled,
          ]}
        >
          {content}
          <AppSymbolIcon
            name="chevron.right"
            size={14}
            tintColor={theme.colors.muted}
          />
        </Pressable>
      ) : (
        <View style={styles.row}>
          <Pressable
            testID="plan-votes-row"
            accessibilityRole="button"
            accessibilityLabel={row.label}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={onAsk}
            style={({ pressed }) => [
              styles.area,
              pressed && styles.pressed,
              disabled && styles.disabled,
            ]}
          >
            {content}
          </Pressable>
          <Pressable
            testID="plan-votes-share"
            accessibilityRole="button"
            accessibilityLabel={t("plan.shareLink")}
            hitSlop={8}
            onPress={() => onShare(token)}
            style={({ pressed }) => [styles.share, pressed && styles.pressed]}
          >
            <AppSymbolIcon
              name="square.and.arrow.up"
              size={15}
              tintColor={theme.colors.foreground}
            />
            <Text style={styles.shareLabel}>{t("common.share")}</Text>
          </Pressable>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { marginTop: theme.gap(1) },
  row: {
    minHeight: theme.gap(8),
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
  area: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
  },
  icon: {
    width: theme.gap(4.5),
    height: theme.gap(4.5),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.gap(2.25),
    backgroundColor: theme.colors.primarySoft,
  },
  text: { flex: 1, gap: theme.gap(0.25) },
  title: { ...theme.type.subheadLabel, color: theme.colors.foreground },
  subtitle: { ...theme.type.footnote, color: theme.colors.muted },
  share: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  shareLabel: { ...theme.type.subhead, color: theme.colors.foreground },
  pressed: { opacity: theme.opacity.pressed },
  disabled: { opacity: theme.opacity.disabled },
}));
