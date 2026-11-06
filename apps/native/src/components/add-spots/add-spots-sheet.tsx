import { AppSymbolIcon } from "@/components/symbol";
import { AddButton, addButtonBottom } from "@/components/tab-bar";
import { ThemedText } from "@/components/ui/themed-text";
import { withAlpha } from "@/lib/color";
import { useSaveGuard } from "@/lib/free-plan";
import { t, useAppLocale } from "@/lib/i18n";
import { sheetIn } from "@/lib/motion";
import { usePlanPicker } from "@/lib/plan-picker";
import { useSiriShortcuts } from "@/lib/siri-phrases";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import Animated, { useReducedMotion } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const SHEET_BOTTOM = 15;

function Chevron() {
  const { theme } = useUnistyles();
  return (
    <AppSymbolIcon
      name="chevron.right"
      size={12}
      weight="semibold"
      tintColor={withAlpha(theme.colors.muted, 0.45)}
    />
  );
}

function Tile({
  emoji,
  label,
  onPress,
}: {
  emoji: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
    >
      <Text style={styles.tileEmoji} allowFontScaling={false}>
        {emoji}
      </Text>
      <Text style={styles.tileLabel} numberOfLines={2}>
        {label}
      </Text>
    </Pressable>
  );
}

function Row({
  emoji,
  label,
  last,
  onPress,
}: {
  emoji: string;
  label: string;
  last?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !last && styles.rowLine,
        pressed && styles.pressed,
      ]}
    >
      <Text style={styles.rowEmoji} allowFontScaling={false}>
        {emoji}
      </Text>
      <Text style={styles.rowLabel} numberOfLines={1}>
        {label}
      </Text>
      <Chevron />
    </Pressable>
  );
}

export function AddSpotsSheet() {
  useAppLocale();
  const router = useRouter();
  const { rt } = useUnistyles();
  const reduced = useReducedMotion();
  const { guard, loading } = useSaveGuard("tab_bar");
  const planner = usePlanPicker({ onLeave: () => router.back() });
  const siri = useSiriShortcuts();
  const closeBottom = addButtonBottom(rt.insets.bottom);
  const addLink = () => {
    if (loading) return;
    void guard(() => {
      router.back();
      router.push("/add");
    });
  };
  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Pressable
        accessible={false}
        onPress={() => router.back()}
        style={styles.backdrop}
      />
      <Animated.View
        entering={sheetIn(reduced)}
        style={[
          styles.sheet,
          { paddingBottom: closeBottom + 64 + 7 - SHEET_BOTTOM },
        ]}
      >
        <ThemedText
          variant="sheetTitle"
          accessibilityRole="header"
          style={styles.title}
        >
          {t("addSheet.title")}
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("addSheet.pasteLink")}, ${t("addSheet.pasteLinkHint")}`}
          onPress={addLink}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
        >
          <Text style={styles.cardEmoji} allowFontScaling={false}>
            🔗
          </Text>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle} numberOfLines={1}>
              {t("addSheet.pasteLink")}
            </Text>
            <Text style={styles.cardHint} numberOfLines={2}>
              {t("addSheet.pasteLinkHint")}
            </Text>
          </View>
          <Chevron />
        </Pressable>
        <View style={styles.tiles}>
          <Tile
            emoji="🎬"
            label={t("addSheet.howToShare")}
            onPress={() => {
              router.back();
              router.push("/how-to-share");
            }}
          />
          <Tile
            emoji="📁"
            label={t("addSheet.googleMapsList")}
            onPress={addLink}
          />
          {siri.length > 0 ? (
            <Tile
              emoji="🎙️"
              label={t("addSheet.saveWithSiri")}
              onPress={() => {
                router.back();
                router.push("/save-with-siri");
              }}
            />
          ) : null}
        </View>
        <Text style={styles.section}>{t("addSheet.organize")}</Text>
        <View style={styles.rows}>
          <Row
            emoji="👥"
            label={t("sharedLists.newTitle")}
            onPress={() => {
              router.back();
              router.push("/new-shared-list");
            }}
          />
          <Row
            emoji="🧳"
            label={t("homePlaces.planTrip")}
            last
            onPress={() => planner.plan("trip")}
          />
        </View>
      </Animated.View>
      <View style={[styles.close, { bottom: closeBottom }]}>
        <AddButton
          label={t("common.close")}
          icon="xmark"
          onPress={() => router.back()}
        />
      </View>
      {planner.sheet}
    </View>
  );
}

const shadow = "0 1px 3px rgba(43, 36, 24, 0.09)";

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    marginHorizontal: 12,
    marginBottom: SHEET_BOTTOM,
    paddingTop: 31,
    paddingHorizontal: 18.5,
    borderRadius: 33,
    borderCurve: "continuous",
    backgroundColor: theme.colors.background,
    boxShadow: "0 -2px 30px rgba(0, 0, 0, 0.18)",
  },
  title: { textAlign: "center", lineHeight: 30, marginBottom: 22 },
  card: {
    height: 96,
    flexDirection: "row",
    alignItems: "center",
    gap: 26,
    paddingLeft: 16,
    paddingRight: 18,
    borderRadius: 17,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    boxShadow: shadow,
  },
  cardEmoji: { width: 52, fontSize: 46, lineHeight: 52, textAlign: "center" },
  cardText: { flex: 1, minWidth: 0, gap: 2 },
  cardTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 20.5,
    lineHeight: 25,
    letterSpacing: -0.2,
    color: theme.colors.foreground,
  },
  cardHint: {
    fontFamily: theme.fonts.regular,
    fontSize: 14.6,
    lineHeight: 19,
    color: theme.colors.muted,
  },
  tiles: { flexDirection: "row", gap: 16, marginTop: 23 },
  tile: {
    flex: 1,
    minWidth: 0,
    height: 116,
    alignItems: "center",
    gap: 17,
    paddingTop: 16,
    paddingHorizontal: 14,
    borderRadius: 17,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    boxShadow: shadow,
  },
  tileEmoji: { fontSize: 33, lineHeight: 36 },
  tileLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 14.6,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.foreground,
  },
  section: {
    marginTop: 21,
    marginBottom: 7,
    textAlign: "center",
    fontFamily: theme.fonts.regular,
    fontSize: 12.6,
    lineHeight: 16,
    color: theme.colors.muted,
  },
  rows: {
    borderRadius: 17,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.surface,
    boxShadow: shadow,
  },
  row: {
    height: 53.5,
    flexDirection: "row",
    alignItems: "center",
    gap: 17,
    paddingLeft: 15.5,
    paddingRight: 18,
  },
  rowLine: {
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowEmoji: { width: 23, fontSize: 21, lineHeight: 24, textAlign: "center" },
  rowLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: theme.fonts.regular,
    fontSize: 16.5,
    lineHeight: 21,
    color: theme.colors.foreground,
  },
  close: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  pressed: { opacity: theme.opacity.pressed },
}));
