import { ScalePressable } from "@/components/onboarding/parts";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { withAlpha } from "@/lib/color";
import { t } from "@/lib/i18n";
import { sheetIn } from "@/lib/motion";
import { Image } from "expo-image";
import type { ReactNode } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const APP_ICON = require("../../../assets/icon.png");

/** The one instruction on screen, in a dark pill above what it points at. */
export function Coach({
  label,
  style,
}: {
  label: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.coach, style]}>
      <Text style={styles.coachText}>{label}</Text>
    </View>
  );
}

/** A drawn sheet rising from the bottom of the stage, with the coach (or a tip) above it. */
function Sheet({ top, children }: { top: ReactNode; children: ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <Animated.View entering={sheetIn(reduced)} style={styles.sheetWrap}>
      {top}
      <View style={styles.sheet}>{children}</View>
    </Animated.View>
  );
}

/** An app or action tile; the target is ringed and pressable, the rest fade back. */
function Tile({
  label,
  symbol,
  round,
  onPress,
}: {
  label: string;
  symbol: AppSymbolName;
  round?: boolean;
  onPress?: () => void;
}) {
  const { theme } = useUnistyles();
  const target = onPress !== undefined;
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!target}
      onPress={onPress}
      style={[styles.tile, !target && styles.faded]}
    >
      <View
        style={[styles.tileIcon, round && styles.round, target && styles.ring]}
      >
        <AppSymbolIcon
          name={symbol}
          size={22}
          tintColor={target ? theme.colors.foreground : theme.colors.muted}
        />
      </View>
      <Text
        style={[styles.tileLabel, target && styles.tileLabelOn]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </ScalePressable>
  );
}

// Made-up friends for the drawn DM grid; names, not copy, so they stay as they are in every language.
const FRIENDS = [
  { name: "Maya", tint: "#E8C4A8" },
  { name: "Leo", tint: "#B9CBB4" },
  { name: "Priya", tint: "#D9B8C4" },
  { name: "Sam", tint: "#B8C6D9" },
  { name: "Noor", tint: "#D9CFA8" },
  { name: "Theo", tint: "#C4B8D9" },
] as const;

function Friend({ name, tint }: { name: string; tint: string }) {
  return (
    <View style={styles.friend}>
      <View style={[styles.avatar, { backgroundColor: tint }]}>
        <Text style={styles.avatarText}>{name[0]}</Text>
      </View>
      <Text style={styles.friendName} numberOfLines={1}>
        {name}
      </Text>
    </View>
  );
}

/** The video app's own share panel, as Instagram lays it out on iPhone: search, DM friends, then actions with Share to… ringed. */
export function AppPanel({ onShare }: { onShare: () => void }) {
  const { theme } = useUnistyles();
  return (
    <Sheet top={<Coach label={t("aha.coachShare")} />}>
      <View style={styles.faded}>
        <View style={styles.search}>
          <AppSymbolIcon
            name="magnifyingglass"
            size={14}
            tintColor={theme.colors.muted}
          />
          <Text style={styles.searchText}>{t("aha.sheetSearch")}</Text>
        </View>
        <View style={styles.friends}>
          {FRIENDS.map((friend) => (
            <Friend key={friend.name} {...friend} />
          ))}
        </View>
      </View>
      <View style={styles.row}>
        <Tile label={t("aha.sheetStory")} symbol="plus" round />
        <Tile label={t("aha.shareMessages")} symbol="message.fill" round />
        <Tile
          label={t("aha.sheetShareTo")}
          symbol="square.and.arrow.up"
          round
          onPress={onShare}
        />
        <Tile label={t("aha.shareCopyLink")} symbol="link" round />
      </View>
    </Sheet>
  );
}

/** The iOS share sheet: the post up top, a row of apps, More ringed. */
export function IosSheet({
  title,
  onMore,
}: {
  title: string;
  onMore: () => void;
}) {
  return (
    <Sheet top={<Coach label={t("aha.coachMore")} />}>
      <View style={[styles.sheetHeader, styles.faded]}>
        <View style={styles.headerThumb} />
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={styles.row}>
        <Tile label={t("aha.shareMessages")} symbol="message.fill" />
        <Tile label={t("aha.sheetMail")} symbol="envelope" />
        <Tile label={t("aha.sheetNotes")} symbol="note.text" />
        <Tile label={t("aha.sheetMore")} symbol="ellipsis" onPress={onMore} />
      </View>
    </Sheet>
  );
}

/** The iOS "Apps" list behind More. `onPick` rings Shelvr; without it, Edit is what matters. */
export function AppsSheet({
  top,
  onPick,
}: {
  top: ReactNode;
  onPick?: () => void;
}) {
  const { theme } = useUnistyles();
  const picking = onPick !== undefined;
  return (
    <Sheet top={top}>
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, styles.faded]}>
          {t("aha.sheetApps")}
        </Text>
        <Text style={[styles.edit, picking && styles.faded]}>
          {t("aha.sheetEdit")}
        </Text>
      </View>
      <View style={[styles.listGroup, styles.faded]}>
        <Text style={styles.section}>{t("aha.sheetFavorites")}</Text>
        <View style={styles.listRow}>
          <View style={styles.listIcon}>
            <AppSymbolIcon
              name="message.fill"
              size={16}
              tintColor={theme.colors.muted}
            />
          </View>
          <Text style={styles.listLabel}>{t("aha.shareMessages")}</Text>
        </View>
        <Text style={styles.section}>{t("aha.sheetSuggestions")}</Text>
      </View>
      <ScalePressable
        accessibilityRole="button"
        accessibilityLabel="Shelvr"
        disabled={!picking}
        onPress={onPick}
        style={[styles.listRow, picking && styles.listRowOn]}
      >
        <Image source={APP_ICON} style={styles.listIcon} />
        <Text style={[styles.listLabel, picking && styles.listLabelOn]}>
          Shelvr
        </Text>
      </ScalePressable>
    </Sheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  coach: {
    alignSelf: "center",
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    borderRadius: 999,
    backgroundColor: theme.colors.background,
    boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
  },
  coachText: {
    ...theme.type.subheadLabel,
    fontFamily: theme.fonts.bold,
    color: theme.colors.foreground,
  },
  sheetWrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    gap: theme.gap(1.5),
  },
  sheet: {
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.xl,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: withAlpha(theme.colors.surface, 0.97),
    boxShadow: "0 -8px 32px rgba(0, 0, 0, 0.18)",
  },
  faded: {
    opacity: 0.35,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.25),
    marginBottom: theme.gap(1.5),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  searchText: {
    ...theme.type.subhead,
    color: theme.colors.muted,
  },
  friends: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: theme.gap(1.5),
  },
  friend: {
    width: "33.33%",
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: {
    ...theme.type.headline,
    color: "#FFFFFF",
  },
  friendName: {
    ...theme.type.captionLabel,
    color: theme.colors.foreground,
  },
  tile: {
    width: 68,
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  tileIcon: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surfaceMuted,
  },
  round: {
    borderRadius: 28,
  },
  ring: {
    borderWidth: 3,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
    transform: [{ scale: 1.08 }],
  },
  tileLabel: {
    ...theme.type.captionLabel,
    color: theme.colors.muted,
  },
  tileLabelOn: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.foreground,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    paddingBottom: theme.gap(1.5),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  headerThumb: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceMuted,
  },
  headerTitle: {
    ...theme.type.subheadLabel,
    flex: 1,
    color: theme.colors.foreground,
  },
  listHeader: {
    flexDirection: "row",
    justifyContent: "center",
  },
  listTitle: {
    ...theme.type.subheadLabel,
    color: theme.colors.foreground,
  },
  edit: {
    ...theme.type.subheadLabel,
    position: "absolute",
    right: 0,
    fontFamily: theme.fonts.bold,
    color: theme.colors.primaryText,
  },
  listGroup: {
    gap: theme.gap(1),
  },
  section: {
    ...theme.type.captionLabel,
    color: theme.colors.muted,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    padding: theme.gap(1),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 2,
    borderColor: "transparent",
    backgroundColor: theme.colors.surfaceMuted,
  },
  listRowOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  listIcon: {
    width: 28,
    height: 28,
    borderRadius: theme.radius.sm,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.background,
  },
  listLabel: {
    ...theme.type.subhead,
    flex: 1,
    color: theme.colors.muted,
  },
  listLabelOn: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.foreground,
  },
}));
