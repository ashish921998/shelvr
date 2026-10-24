import { ScalePressable } from "@/components/onboarding/parts";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { withAlpha } from "@/lib/color";
import { t } from "@/lib/i18n";
import { sheetIn } from "@/lib/motion";
import type { TextMessageKey } from "@/locales/message-types";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { useState, type ReactNode } from "react";
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

/** Where the walk is in the iOS "Apps" list behind More: Edit, + next to Shelvr, Done, then Shelvr itself. */
type AppsStep = "edit" | "add" | "done" | "pick";

const NEXT_STEP: Record<Exclude<AppsStep, "pick">, AppsStep> = {
  edit: "add",
  add: "done",
  done: "pick",
};

export function tick() {
  if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
}

const APPS_COACH: Record<AppsStep, TextMessageKey> = {
  edit: "aha.coachEdit",
  add: "aha.coachAdd",
  done: "aha.coachDone",
  pick: "aha.coachShelvr",
};

/** iOS's own edit-mode badges, drawn in its system colors like the rest of the sheet. */
function EditBadge({
  kind,
  onPress,
}: {
  kind: "add" | "remove";
  onPress?: () => void;
}) {
  const add = kind === "add";
  return (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel={add ? t("aha.pinShelvr") : undefined}
      accessible={onPress !== undefined}
      disabled={onPress === undefined}
      onPress={onPress}
      hitSlop={12}
      style={[
        styles.badge,
        add ? styles.badgeAdd : styles.badgeRemove,
        onPress && styles.badgeOn,
      ]}
    >
      <AppSymbolIcon
        name={add ? "plus" : "minus"}
        size={12}
        tintColor="#FFFFFF"
      />
    </ScalePressable>
  );
}

/** The iOS "Apps" list, walked one tap at a time: only the step's target is lit and pressable. */
export function AppsSheet({ onPick }: { onPick: () => void }) {
  const { theme } = useUnistyles();
  const [step, setStep] = useState<AppsStep>("edit");
  const onNext =
    step === "pick"
      ? onPick
      : () => {
          tick();
          setStep(NEXT_STEP[step]);
        };
  const editing = step === "add" || step === "done";
  const pinned = step === "done" || step === "pick";
  const corner = step === "edit" || step === "done";
  const shelvr = (
    <ScalePressable
      accessibilityRole="button"
      accessibilityLabel="Shelvr"
      accessible={step === "pick"}
      disabled={step !== "pick"}
      onPress={onNext}
      style={[
        styles.listRow,
        step === "pick" && styles.listRowOn,
        step === "edit" && styles.faded,
      ]}
    >
      {editing ? (
        <EditBadge
          kind={pinned ? "remove" : "add"}
          onPress={step === "add" ? onNext : undefined}
        />
      ) : null}
      <Image source={APP_ICON} style={styles.listIcon} />
      <Text style={[styles.listLabel, step === "pick" && styles.listLabelOn]}>
        Shelvr
      </Text>
    </ScalePressable>
  );
  return (
    <Sheet top={<Coach label={t(APPS_COACH[step])} />}>
      <View style={styles.listHeader}>
        <Text style={[styles.listTitle, styles.faded]}>
          {t("aha.sheetApps")}
        </Text>
        <ScalePressable
          accessibilityRole="button"
          disabled={!corner}
          onPress={onNext}
          hitSlop={12}
          style={[styles.corner, corner ? styles.cornerOn : styles.faded]}
        >
          <Text style={styles.edit}>
            {editing ? t("aha.sheetDone") : t("aha.sheetEdit")}
          </Text>
        </ScalePressable>
      </View>
      <Text style={[styles.section, styles.faded]}>
        {t("aha.sheetFavorites")}
      </Text>
      <View style={[styles.listRow, styles.faded]}>
        {editing ? <EditBadge kind="remove" /> : null}
        <View style={styles.listIcon}>
          <AppSymbolIcon
            name="message.fill"
            size={16}
            tintColor={theme.colors.muted}
          />
        </View>
        <Text style={styles.listLabel}>{t("aha.shareMessages")}</Text>
      </View>
      {pinned ? shelvr : null}
      <Text style={[styles.section, styles.faded]}>
        {t("aha.sheetSuggestions")}
      </Text>
      {pinned ? null : shelvr}
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
  corner: {
    position: "absolute",
    right: -theme.gap(0.75),
    top: -theme.gap(0.5),
    paddingVertical: theme.gap(0.5),
    paddingHorizontal: theme.gap(0.75),
    borderRadius: 999,
    borderWidth: 2,
    borderColor: "transparent",
  },
  cornerOn: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.surface,
  },
  edit: {
    ...theme.type.subheadLabel,
    fontFamily: theme.fonts.bold,
    color: theme.colors.primaryText,
  },
  badge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeAdd: {
    backgroundColor: "#34C759",
  },
  badgeRemove: {
    backgroundColor: "#FF3B30",
  },
  badgeOn: {
    boxShadow: `0 0 0 3px ${theme.colors.primary}`,
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
