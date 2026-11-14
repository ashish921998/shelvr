import { AppSymbolIcon } from "@/components/symbol";
import { analytics } from "@/lib/analytics";
import {
  badgeEmoji,
  badgeGoal,
  badgeName,
  badgeProgress,
} from "@/lib/badge-copy";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import { t, useAppLocale } from "@/lib/i18n";
import {
  type BadgeId,
  type BadgeState,
  type BadgeTotals,
  badgeStates,
  nextBadge,
} from "@convex/model/badges";
import { useCallback } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MEDAL_SIZE = 56;

export function useBadgeAccess(): { locked: boolean; unlock: () => void } {
  const { entitled, loading } = useEntitlement();
  const { guard } = usePaywallGuard("passport");
  const unlock = useCallback(() => {
    analytics.capture("passport_paywall_opened", { surface: "badge" });
    void guard();
  }, [guard]);
  return { locked: !loading && !entitled, unlock };
}

function shownBadges(totals: BadgeTotals, locked: boolean): BadgeState[] {
  const states = badgeStates(totals);
  if (locked) return states;
  const next = nextBadge(totals);
  return [...states.filter((state) => state.earned), ...(next ? [next] : [])];
}

function BadgeChip({
  state,
  locked,
  onPress,
}: {
  state: BadgeState;
  locked: boolean;
  onPress?: () => void;
}) {
  const { theme } = useUnistyles();
  const { badge, earned } = state;
  const lit = earned && !locked;
  const name = badgeName(badge.id);
  const caption = earned ? badgeGoal(badge) : badgeProgress(state);
  return (
    <Pressable
      testID={`badge-${badge.id}`}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={`${name}, ${caption}`}
      accessibilityHint={
        locked
          ? t("badges.lockedHint")
          : lit
            ? t("badges.shareHint")
            : undefined
      }
      disabled={onPress === undefined}
      onPress={onPress}
      style={({ pressed }) => [styles.chip, pressed && styles.pressed]}
    >
      <View style={[styles.medal, !lit && styles.medalDim]}>
        <Text style={[styles.emoji, !lit && styles.emojiDim]}>
          {badgeEmoji(badge.id)}
        </Text>
        {locked || lit ? (
          <View style={styles.corner}>
            <AppSymbolIcon
              name={locked ? "lock" : "square.and.arrow.up"}
              size={10}
              tintColor={theme.colors.primaryText}
            />
          </View>
        ) : null}
      </View>
      <Text style={[styles.name, !lit && styles.nameDim]} numberOfLines={2}>
        {name}
      </Text>
      <Text style={styles.caption} numberOfLines={2}>
        {caption}
      </Text>
    </Pressable>
  );
}

export function MilestonesRow({
  totals,
  locked,
  onUnlock,
  onShare,
}: {
  totals: BadgeTotals;
  locked: boolean;
  onUnlock: () => void;
  onShare: (badge: BadgeId) => void;
}) {
  useAppLocale();
  const shown = shownBadges(totals, locked);
  return (
    <View testID="passport-milestones" style={styles.section}>
      <Text style={styles.title}>{t("badges.title")}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {shown.map((state) => (
          <BadgeChip
            key={state.badge.id}
            state={state}
            locked={locked}
            onPress={
              locked
                ? onUnlock
                : state.earned
                  ? () => onShare(state.badge.id)
                  : undefined
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  section: { gap: theme.gap(1) },
  title: { ...theme.type.headline, color: theme.colors.foreground },
  row: { gap: theme.gap(1.5), paddingVertical: theme.gap(0.5) },
  chip: { width: 96, alignItems: "center", gap: theme.gap(0.5) },
  pressed: { opacity: theme.opacity.pressed },
  medal: {
    width: MEDAL_SIZE,
    height: MEDAL_SIZE,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: MEDAL_SIZE / 2,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primarySoft,
  },
  medalDim: {
    borderStyle: "dashed",
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceMuted,
  },
  emoji: { fontSize: theme.type.largeTitle.fontSize },
  emojiDim: { opacity: theme.opacity.disabled },
  corner: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  name: {
    ...theme.type.captionStrong,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  nameDim: { color: theme.colors.muted },
  caption: {
    ...theme.type.finePrint,
    color: theme.colors.muted,
    textAlign: "center",
  },
}));
