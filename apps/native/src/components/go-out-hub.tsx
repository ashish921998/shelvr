import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { motion, sheetIn } from "@/lib/motion";
import { useMemo } from "react";
import { Pressable, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";

const DISMISS_DISTANCE = 80;
const FLICK_DISTANCE = 24;
const FLICK_VELOCITY = 650;

function PlanCard({
  kind,
  onPress,
}: {
  kind: "date" | "trip";
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  const date = kind === "date";
  const title = t(date ? "homePlaces.planDate" : "homePlaces.planTrip");
  const detail = t(date ? "goOut.dateDetail" : "goOut.tripDetail");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.icon}>
        <AppSymbolIcon
          name={date ? "heart.fill" : "suitcase.fill"}
          size={23}
          tintColor={theme.colors.primaryText}
        />
      </View>
      <View style={styles.cardCopy}>
        <ThemedText variant="title">{title}</ThemedText>
        <ThemedText variant="subhead" style={styles.muted}>
          {detail}
        </ThemedText>
      </View>
      <AppSymbolIcon
        name="chevron.right"
        size={14}
        tintColor={theme.colors.muted}
      />
    </Pressable>
  );
}

export function GoOutHub({
  city,
  onClose,
  onPlan,
  onPickSpot,
}: {
  city: string;
  onClose: () => void;
  onPlan: (kind: "date" | "trip") => void;
  onPickSpot: () => void;
}) {
  const { theme } = useUnistyles();
  const reduced = useReducedMotion();
  const offset = useSharedValue(0);
  const scrollY = useSharedValue(0);
  const draggingSheet = useSharedValue(false);
  const onScroll = useAnimatedScrollHandler(({ contentOffset }) => {
    scrollY.set(contentOffset.y);
  });
  const dragStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.get() }],
  }));
  const { headerDrag, contentDrag } = useMemo(() => {
    const makeDrag = (fromScroll: boolean) =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-32, 32])
        .onStart(() => {
          draggingSheet.set(!fromScroll || scrollY.get() <= 0);
        })
        .onUpdate(({ translationY }) => {
          if (draggingSheet.get()) offset.set(Math.max(0, translationY));
        })
        .onFinalize(({ translationY, velocityY }, success) => {
          const flick =
            translationY >= FLICK_DISTANCE && velocityY >= FLICK_VELOCITY;
          if (
            success &&
            draggingSheet.get() &&
            (translationY >= DISMISS_DISTANCE || flick)
          ) {
            scheduleOnRN(onClose);
          } else {
            offset.set(withTiming(0, motion.timing.feedback));
          }
          draggingSheet.set(false);
        });
    return {
      headerDrag: makeDrag(false),
      contentDrag: Gesture.Simultaneous(makeDrag(true), Gesture.Native()),
    };
  }, [draggingSheet, offset, onClose, scrollY]);
  return (
    <View style={styles.screen} accessibilityViewIsModal>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.close")}
        onPress={onClose}
        style={styles.backdrop}
      />
      <Animated.View
        entering={sheetIn(reduced)}
        style={[styles.sheet, dragStyle]}
      >
        <GestureDetector gesture={headerDrag}>
          <View collapsable={false}>
            <View style={styles.grabber} />
            <View style={styles.topbar}>
              <ThemedText variant="sheetTitle" accessibilityRole="header">
                {t("plan.goOut")}
              </ThemedText>
              {city ? (
                <View style={styles.location}>
                  <AppSymbolIcon
                    name="mappin"
                    size={14}
                    tintColor={theme.colors.muted}
                  />
                  <ThemedText variant="subhead" style={styles.city}>
                    {city}
                  </ThemedText>
                </View>
              ) : null}
            </View>
          </View>
        </GestureDetector>
        <GestureDetector gesture={contentDrag}>
          <Animated.ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.content}
            onScroll={onScroll}
            scrollEventThrottle={16}
            bounces={false}
            overScrollMode="never"
          >
            <View style={styles.cards}>
              <PlanCard kind="date" onPress={() => onPlan("date")} />
              <PlanCard kind="trip" onPress={() => onPlan("trip")} />
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("goOut.quickPick")}
              accessibilityHint={t("goOut.quickPickBody")}
              onPress={onPickSpot}
              style={({ pressed }) => [
                styles.quickPick,
                pressed && styles.pressed,
              ]}
            >
              <AppSymbolIcon
                name="dice.fill"
                size={22}
                tintColor={theme.colors.muted}
              />
              <View style={styles.quickCopy}>
                <ThemedText variant="bodyLabel">
                  {t("goOut.quickPick")}
                </ThemedText>
                <ThemedText variant="footnote" style={styles.muted}>
                  {t("goOut.quickPickBody")}
                </ThemedText>
              </View>
              <AppSymbolIcon
                name="chevron.right"
                size={13}
                tintColor={theme.colors.muted}
              />
            </Pressable>
          </Animated.ScrollView>
        </GestureDetector>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    justifyContent: "flex-end",
    paddingTop: rt.insets.top + theme.gap(1),
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheet: {
    flexShrink: 1,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    overflow: "hidden",
    backgroundColor: theme.colors.background,
  },
  topbar: {
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(0.75),
    paddingBottom: theme.gap(2),
    gap: theme.gap(0.75),
  },
  grabber: {
    alignSelf: "center",
    width: theme.gap(4.5),
    height: theme.gap(0.5),
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.muted,
    opacity: 0.5,
    marginTop: theme.gap(1.25),
    marginBottom: theme.gap(0.75),
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  content: {
    paddingHorizontal: theme.gap(3),
    paddingBottom: Math.max(rt.insets.bottom, theme.gap(1)),
  },
  location: { flexDirection: "row", alignItems: "center", gap: theme.gap(0.5) },
  city: { flexShrink: 1, color: theme.colors.muted },
  muted: { color: theme.colors.muted },
  cards: { gap: theme.gap(1.5) },
  card: {
    minHeight: 92,
    borderRadius: theme.radius.xl,
    padding: theme.gap(2),
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.75),
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: { flex: 1, gap: theme.gap(0.25) },
  quickPick: {
    marginTop: theme.gap(2),
    paddingVertical: theme.gap(2),
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
  quickCopy: { flex: 1, gap: theme.gap(0.5) },
  pressed: { opacity: theme.opacity.pressed },
}));
