import { AppSymbolIcon } from "@/components/symbol";
import { ActionMenu } from "@/components/ui/action-menu";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { fadeIn, fadeOut, motion } from "@/lib/motion";
import {
  dropPlace,
  EDIT_HEADER_HEIGHT,
  EDIT_ROW_HEIGHT,
  editDayLabel,
  editEntries,
  entryTops,
  moveInLayout,
  moveTargets,
  placeOf,
  type StopPlace,
  type TripUndo,
  useTripEditor,
} from "@/lib/trip-edit";
import { stopBadge, tripTitle } from "@/lib/trip-planner";
import type { Id } from "@convex/_generated/dataModel";
import {
  MAX_TRIP_NAME_CHARS,
  type TripPlanDetail,
  type TripPlanStop,
  UNPLANNED_DAY,
} from "@convex/model/tripPlan";
import * as Haptics from "expo-haptics";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AccessibilityInfo,
  type AccessibilityActionEvent,
  Pressable,
  TextInput,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  type SharedValue,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useScrollViewOffset,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { scheduleOnRN } from "react-native-worklets";

/** How close to the top or bottom edge a dragged stop starts the list scrolling. */
const SCROLL_EDGE = 72;
/** The fastest the list scrolls under a dragged stop, in points a frame. */
const SCROLL_STEP = 12;
const LONG_PRESS_MS = 220;
/** After a remove, rows slide up under the finger; a tap this soon after is ignored. */
const REMOVE_SETTLE_MS = 450;
// Big text still fits the fixed rows that drag maths depends on.
const MAX_FONT_SCALE = 1.4;

type Drag = { stopId: Id<"tripStops">; to: StopPlace };

/** What every row's drag shares: where the dragged stop is, and which one it is. */
type DragValues = {
  activeId: SharedValue<string | null>;
  dragTop: SharedValue<number>;
  startTop: SharedValue<number>;
  translation: SharedValue<number>;
  scrollStart: SharedValue<number>;
  scrollY: SharedValue<number>;
};

function tick() {
  if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
}

function useSlotTop(top: number, id: string, drag: DragValues) {
  const slot = useSharedValue(top);
  useEffect(() => {
    slot.set(withSpring(top, motion.spring.snap));
  }, [slot, top]);
  // Dropped: the row springs from under the finger into its slot rather than jumping there.
  useAnimatedReaction(
    () => drag.activeId.get() === id,
    (dragged, was) => {
      if (was && !dragged) {
        slot.set(drag.dragTop.get());
        slot.set(withSpring(top, motion.spring.snap));
      }
    },
    [top, id],
  );
  return slot;
}

function DayHeaderRow({
  day,
  top,
  stops,
  startDate,
  onAdd,
}: {
  day: number;
  top: number;
  stops: number;
  startDate: string | undefined;
  onAdd: (day: number) => void;
}) {
  const { theme } = useUnistyles();
  const y = useSharedValue(top);
  useEffect(() => {
    y.set(withSpring(top, motion.spring.snap));
  }, [y, top]);
  const placed = useAnimatedStyle(() => ({ top: y.get() }));
  const label = editDayLabel(day, startDate);
  const unplanned = day === UNPLANNED_DAY;
  return (
    <Animated.View style={[styles.header, placed]}>
      <View style={styles.headerText}>
        <ThemedText
          variant="header"
          accessibilityRole="header"
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
        >
          {label}
        </ThemedText>
        <ThemedText
          variant="caption"
          numberOfLines={1}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={styles.muted}
        >
          {unplanned
            ? t("tripPlanner.unplannedHint")
            : t("trip.stopCount", { count: stops })}
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("tripPlanner.addPlaceTo", { day: label })}
        hitSlop={8}
        onPress={() => onAdd(day)}
        style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name="plus"
          size={20}
          tintColor={theme.colors.primaryText}
        />
      </Pressable>
    </Animated.View>
  );
}

type RowProps = {
  stop: TripPlanStop;
  day: number;
  top: number;
  trip: Pick<TripPlanDetail, "dayCount" | "startDate">;
  /** How many stops the row's day holds, so Move down knows the last one. */
  dayLength: number;
  index: number;
  drag: DragValues;
  onDragStart: (stopId: Id<"tripStops">) => void;
  onDragEnd: () => void;
  onMove: (stop: TripPlanStop, to: StopPlace) => void;
  onRemove: (stop: TripPlanStop) => void;
};

function StopEditRow(props: RowProps) {
  const { stop, day, top, trip, drag, onDragStart, onDragEnd } = props;
  const { theme } = useUnistyles();
  const slot = useSlotTop(top, stop._id, drag);
  const placed = useAnimatedStyle(() => {
    const dragged = drag.activeId.get() === stop._id;
    return {
      top: dragged ? drag.dragTop.get() : slot.get(),
      zIndex: dragged ? 10 : 0,
      transform: [
        { scale: withTiming(dragged ? 1.03 : 1, motion.timing.feedback) },
      ],
      shadowOpacity: withTiming(dragged ? 0.18 : 0, motion.timing.feedback),
    };
  });
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(LONG_PRESS_MS)
        .onStart(() => {
          drag.startTop.set(slot.get());
          drag.translation.set(0);
          drag.scrollStart.set(drag.scrollY.get());
          drag.activeId.set(stop._id);
          scheduleOnRN(onDragStart, stop._id);
        })
        .onChange((event) => {
          drag.translation.set(event.translationY);
        })
        .onFinalize(() => {
          if (drag.activeId.get() !== stop._id) return;
          drag.activeId.set(null);
          scheduleOnRN(onDragEnd);
        }),
    [drag, onDragEnd, onDragStart, slot, stop._id],
  );
  const actions = useRowActions(props);
  const unplanned = day === UNPLANNED_DAY;
  const subtitle = [t(stopBadge(stop.source)), stop.area]
    .filter(Boolean)
    .join(" · ");
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.row, placed]}
        accessible
        accessibilityLabel={`${stop.name}, ${subtitle}`}
        accessibilityHint={t("tripPlanner.editHint")}
        accessibilityActions={actions.list}
        onAccessibilityAction={actions.run}
      >
        {unplanned ? (
          <ActionMenu
            label={t("tripPlanner.placeStop", { name: stop.name })}
            title={t("tripPlanner.placeStop", { name: stop.name })}
            actions={moveTargets(trip, UNPLANNED_DAY).map((target) => ({
              label: target.label,
              onPress: () =>
                props.onMove(stop, {
                  day: target.day,
                  index: Number.MAX_SAFE_INTEGER,
                }),
            }))}
            style={styles.iconButton}
          >
            <AppSymbolIcon
              name="plus.circle.fill"
              size={24}
              tintColor={theme.colors.primary}
            />
          </ActionMenu>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("tripPlanner.removeStop", {
              name: stop.name,
            })}
            hitSlop={6}
            onPress={() => props.onRemove(stop)}
            style={({ pressed }) => [
              styles.iconButton,
              pressed && styles.pressed,
            ]}
          >
            <AppSymbolIcon
              name="minus.circle.fill"
              size={24}
              tintColor={theme.colors.danger}
            />
          </Pressable>
        )}
        <View style={styles.rowText}>
          <ThemedText
            variant="subheadStrong"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
          >
            {stop.name}
          </ThemedText>
          <ThemedText
            variant="caption"
            numberOfLines={1}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={styles.muted}
          >
            {subtitle}
          </ThemedText>
        </View>
        <AppSymbolIcon
          name="line.3.horizontal"
          size={20}
          tintColor={theme.colors.muted}
        />
      </Animated.View>
    </GestureDetector>
  );
}

/** VoiceOver and TalkBack can't drag, so every move a drag makes is also a named action. */
function useRowActions({
  stop,
  day,
  index,
  dayLength,
  trip,
  onMove,
  onRemove,
}: RowProps) {
  return useMemo(() => {
    const targets = moveTargets(trip, day);
    const list = [
      ...(index > 0 ? [{ name: "up", label: t("tripPlanner.moveUp") }] : []),
      ...(index < dayLength - 1
        ? [{ name: "down", label: t("tripPlanner.moveDown") }]
        : []),
      ...targets.map((target) => ({
        name: `day-${target.day}`,
        label: target.label,
      })),
      ...(day !== UNPLANNED_DAY
        ? [
            {
              name: "remove",
              label: t("tripPlanner.removeStop", { name: stop.name }),
            },
          ]
        : []),
    ];
    const run = ({ nativeEvent }: AccessibilityActionEvent) => {
      const name = nativeEvent.actionName;
      if (name === "up") onMove(stop, { day, index: index - 1 });
      else if (name === "down") onMove(stop, { day, index: index + 1 });
      else if (name === "remove") onRemove(stop);
      else if (name.startsWith("day-")) {
        onMove(stop, {
          day: Number(name.slice(4)),
          index: Number.MAX_SAFE_INTEGER,
        });
      }
    };
    return { list, run };
  }, [day, dayLength, index, onMove, onRemove, stop, trip]);
}

/** Drags the list itself while a held stop sits near its top or bottom edge. */
function useEdgeScroll(
  ref: ReturnType<typeof useAnimatedRef<Animated.ScrollView>>,
  drag: DragValues,
  frame: {
    listTop: SharedValue<number>;
    viewport: SharedValue<number>;
    content: SharedValue<number>;
  },
) {
  useFrameCallback(() => {
    if (drag.activeId.get() === null) return;
    const scroll = drag.scrollY.get();
    const onScreen = frame.listTop.get() + drag.dragTop.get() - scroll;
    const max = Math.max(0, frame.content.get() - frame.viewport.get());
    let step = 0;
    if (onScreen < SCROLL_EDGE) {
      step = -SCROLL_STEP * Math.min(1, (SCROLL_EDGE - onScreen) / SCROLL_EDGE);
    } else if (
      onScreen + EDIT_ROW_HEIGHT >
      frame.viewport.get() - SCROLL_EDGE
    ) {
      const over =
        onScreen + EDIT_ROW_HEIGHT - (frame.viewport.get() - SCROLL_EDGE);
      step = SCROLL_STEP * Math.min(1, over / SCROLL_EDGE);
    }
    const next = Math.min(max, Math.max(0, scroll + step));
    if (next !== scroll) scrollTo(ref, 0, next, false);
  });
}

/**
 * Edit mode: every day and Unplanned as fixed-height rows. Hold a stop to drag it within its
 * day or onto another; the minus takes it off to Unplanned, and the plus puts it back on a day.
 */
export function TripEditList({
  trip,
  header,
  onAddPlace,
}: {
  trip: TripPlanDetail;
  /** The name field and hint, above the days. */
  header: ReactNode;
  onAddPlace: (day: number) => void;
}) {
  const editor = useTripEditor(trip);
  const ref = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useScrollViewOffset(ref);
  const listTop = useSharedValue(0);
  const viewport = useSharedValue(0);
  const content = useSharedValue(0);
  const activeId = useSharedValue<string | null>(null);
  const startTop = useSharedValue(0);
  const translation = useSharedValue(0);
  const scrollStart = useSharedValue(0);
  const dragTop = useDerivedValue(
    () =>
      startTop.get() + translation.get() + scrollY.get() - scrollStart.get(),
  );
  const values = useMemo<DragValues>(
    () => ({ activeId, dragTop, startTop, translation, scrollStart, scrollY }),
    [activeId, dragTop, startTop, translation, scrollStart, scrollY],
  );
  useEdgeScroll(ref, values, { listTop, viewport, content });

  const [drag, setDragState] = useState<Drag | null>(null);
  // Mirrored for the drop, which must read the last target without a state updater's side effect.
  const dragRef = useRef<Drag | null>(null);
  const setDrag = useCallback((next: Drag | null) => {
    dragRef.current = next;
    setDragState(next);
  }, []);
  // The other entries while a stop is held, for the UI thread to work out where it would land.
  const others = useSharedValue<{ isStop: boolean[]; days: number[] }>({
    isStop: [],
    days: [],
  });

  const removedAt = useRef(0);
  const shown = drag ? moveInLayout(trip, drag.stopId, drag.to) : trip;
  const entries = editEntries(shown);
  const { tops, height } = entryTops(entries);

  const onDragStart = useCallback(
    (stopId: Id<"tripStops">) => {
      const from = placeOf(trip, stopId);
      if (from === null) return;
      const rest = editEntries({
        days: trip.days.map((day) => day.filter((stop) => stop._id !== stopId)),
        unplanned: trip.unplanned.filter((stop) => stop._id !== stopId),
      });
      others.set({
        isStop: rest.map((entry) => entry.kind === "stop"),
        days: rest.map((entry) => entry.day),
      });
      tick();
      setDrag({ stopId, to: from });
    },
    [others, setDrag, trip],
  );
  const setTarget = useCallback(
    (day: number, index: number) => {
      tick();
      setDrag(dragRef.current && { ...dragRef.current, to: { day, index } });
    },
    [setDrag],
  );
  useAnimatedReaction(
    () => {
      if (activeId.get() === null) return null;
      const { isStop, days } = others.get();
      if (isStop.length === 0) return null;
      const place = dropPlace(
        isStop,
        days,
        dragTop.get() + EDIT_ROW_HEIGHT / 2,
      );
      return `${place.day}:${place.index}`;
    },
    (place, was) => {
      if (place === null || place === was) return;
      const [day, index] = place.split(":").map(Number);
      scheduleOnRN(setTarget, day, index);
    },
  );
  const onDragEnd = useCallback(() => {
    const done = dragRef.current;
    setDrag(null);
    if (done !== null) void editor.moveStop(done.stopId, done.to, "drag");
  }, [editor, setDrag]);
  const onMove = useCallback(
    (stop: TripPlanStop, to: StopPlace) => {
      tick();
      void editor.moveStop(stop._id, to, "menu");
    },
    [editor],
  );
  const onRemove = useCallback(
    (stop: TripPlanStop) => {
      if (Date.now() - removedAt.current < REMOVE_SETTLE_MS) return;
      removedAt.current = Date.now();
      tick();
      void editor.removeStop(stop);
    },
    [editor],
  );

  const dayLength = (day: number) =>
    (day === UNPLANNED_DAY ? shown.unplanned : shown.days[day - 1])?.length ??
    0;
  const indexes = new Map<number, number>();

  return (
    <View style={styles.screen}>
      <Animated.ScrollView
        ref={ref}
        style={styles.screen}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={drag === null}
        keyboardShouldPersistTaps="handled"
        onLayout={({ nativeEvent }) => viewport.set(nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => content.set(h)}
      >
        {header}
        <View
          style={[styles.list, { height }]}
          onLayout={({ nativeEvent }) => listTop.set(nativeEvent.layout.y)}
        >
          {entries.map((entry, i) => {
            if (entry.kind === "header") {
              return (
                <DayHeaderRow
                  key={`header-${entry.day}`}
                  day={entry.day}
                  top={tops[i]}
                  stops={dayLength(entry.day)}
                  startDate={trip.startDate}
                  onAdd={onAddPlace}
                />
              );
            }
            const index = indexes.get(entry.day) ?? 0;
            indexes.set(entry.day, index + 1);
            return (
              <StopEditRow
                key={entry.stop._id}
                stop={entry.stop}
                day={entry.day}
                top={tops[i]}
                trip={trip}
                index={index}
                dayLength={dayLength(entry.day)}
                drag={values}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onMove={onMove}
                onRemove={onRemove}
              />
            );
          })}
        </View>
      </Animated.ScrollView>
      <TripUndoBar undo={editor.undo} onUndo={() => void editor.undoLast()} />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  scrollContent: {
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1),
    paddingBottom: rt.insets.bottom + theme.gap(10),
  },
  list: { position: "relative" },
  header: {
    position: "absolute",
    left: 0,
    right: 0,
    height: EDIT_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: theme.gap(1),
    paddingBottom: theme.gap(0.75),
  },
  headerText: { flex: 1, gap: theme.gap(0.25) },
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(0.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 12,
    // Rows sit 4pt apart inside their fixed slot.
    height: EDIT_ROW_HEIGHT - 4,
    marginTop: 2,
  },
  rowText: { flex: 1, gap: theme.gap(0.25) },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  muted: { color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));

/** The trip's name, editable in place, and how to drag. */
export function TripEditHeader({
  city,
  name,
  onChangeName,
  onSubmitName,
}: {
  city: string;
  name: string;
  onChangeName: (name: string) => void;
  onSubmitName: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={editStyles.editHeader}>
      <TextInput
        testID="trip-name"
        value={name}
        onChangeText={onChangeName}
        onEndEditing={onSubmitName}
        onSubmitEditing={onSubmitName}
        placeholder={tripTitle(city)}
        placeholderTextColor={theme.colors.muted}
        accessibilityLabel={t("tripPlanner.nameLabel")}
        maxLength={MAX_TRIP_NAME_CHARS}
        returnKeyType="done"
        style={editStyles.nameInput}
      />
      <ThemedText variant="footnote" style={styles.muted}>
        {t("tripPlanner.editHint")}
      </ThemedText>
    </View>
  );
}

/** "Removed Kafeine · Undo", pinned at the bottom for a few seconds after an edit. */
function TripUndoBar({
  undo,
  onUndo,
}: {
  undo: TripUndo | null;
  onUndo: () => void;
}) {
  // The live region below speaks only on Android; VoiceOver needs telling.
  const message = undo?.message;
  useEffect(() => {
    if (message && process.env.EXPO_OS === "ios") {
      AccessibilityInfo.announceForAccessibility(message);
    }
  }, [message]);
  if (undo === null) return null;
  return (
    <Animated.View
      entering={fadeIn}
      exiting={fadeOut}
      style={editStyles.undoBar}
      accessibilityLiveRegion="polite"
    >
      <ThemedText
        variant="footnote"
        numberOfLines={2}
        style={editStyles.undoText}
      >
        {undo.message}
      </ThemedText>
      <Pressable
        accessibilityRole="button"
        hitSlop={8}
        onPress={onUndo}
        style={({ pressed }) => [
          editStyles.undoButton,
          pressed && styles.pressed,
        ]}
      >
        <ThemedText variant="labelStrong" style={editStyles.undoAction}>
          {t("common.undo")}
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

const editStyles = StyleSheet.create((theme, rt) => ({
  editHeader: { gap: theme.gap(1), paddingBottom: theme.gap(1) },
  nameInput: {
    ...theme.type.largeTitle,
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    color: theme.colors.foreground,
  },
  undoBar: {
    position: "absolute",
    left: theme.gap(2),
    right: theme.gap(2),
    bottom: rt.insets.bottom + theme.gap(2),
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingLeft: theme.gap(2),
    paddingRight: theme.gap(1),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.foreground,
  },
  undoText: { flex: 1, color: theme.colors.background },
  undoButton: {
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(1),
  },
  undoAction: { color: theme.colors.primary },
}));
