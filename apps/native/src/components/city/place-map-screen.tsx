import { CityMap } from "@/components/city/city-map";
import { CitySheet, moveSheet } from "@/components/city/city-sheet";
import type { CityPin } from "@/lib/city-pins";
import { sheetSnaps } from "@/lib/city-sheet";
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { FlatList, View } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAP_SHARE = 0.4;

export function PlaceMapScreen<Row extends { id: string }>({
  pins,
  hasMap,
  rows,
  rowGap,
  selected,
  onSelect,
  header,
  renderRow,
  empty,
  footer,
  plans,
  children,
}: {
  pins: CityPin[];
  hasMap: boolean;
  rows: Row[];
  rowGap: number;
  selected: string | null;
  onSelect: (id: string) => void;
  header: ReactNode;
  renderRow: (row: Row, select: (id: string) => void) => ReactElement;
  empty: ReactElement;
  footer?: ReactElement;
  plans: ReactNode;
  children?: ReactNode;
}) {
  const { theme, rt } = useUnistyles();
  const list = useRef<FlatList<Row>>(null);
  const { height: screenHeight } = rt.screen;
  const [headerHeight, setHeaderHeight] = useState<number | null>(null);
  const [plansHeight, setPlansHeight] = useState<number | null>(null);
  const snaps = useMemo(
    () =>
      sheetSnaps({
        height: screenHeight,
        insetTop: rt.insets.top,
        insetBottom: rt.insets.bottom,
        middle: screenHeight * MAP_SHARE - theme.gap(3),
        ...(headerHeight !== null && plansHeight !== null
          ? { collapsedVisible: headerHeight + plansHeight - rt.insets.bottom }
          : {}),
      }),
    [screenHeight, rt.insets, theme, headerHeight, plansHeight],
  );
  const restingSnaps = useMemo(
    () =>
      hasMap
        ? snaps
        : { ...snaps, middle: snaps.expanded, collapsed: snaps.expanded },
    [hasMap, snaps],
  );
  const sheetTop = useSharedValue(restingSnaps.middle);
  const restingMiddle = restingSnaps.middle;
  useEffect(() => {
    sheetTop.set(restingMiddle);
  }, [restingMiddle, sheetTop]);

  const select = (id: string) => {
    onSelect(id);
    if (sheetTop.get() > snaps.middle) moveSheet(sheetTop, snaps.middle);
    const index = rows.findIndex((row) => row.id === id);
    if (index >= 0) list.current?.scrollToIndex({ index, viewPosition: 0.3 });
  };

  return (
    <View style={styles.container}>
      {hasMap ? (
        <View style={styles.map}>
          <CityMap
            pins={pins}
            selected={selected}
            height={screenHeight}
            coveredBottom={screenHeight - snaps.middle}
            onSelect={select}
          />
        </View>
      ) : null}
      <CitySheet
        snaps={restingSnaps}
        onHeaderHeight={setHeaderHeight}
        top={sheetTop}
        header={header}
        list={(scroll) => (
          <Animated.FlatList
            ref={list}
            scrollEnabled={scroll.scrollEnabled}
            onScroll={scroll.onScroll}
            scrollEventThrottle={16}
            bounces={scroll.bounces}
            data={rows}
            keyExtractor={(row) => row.id}
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[styles.content, { gap: theme.gap(rowGap) }]}
            onScrollToIndexFailed={(info) =>
              list.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
              })
            }
            renderItem={({ item }) => renderRow(item, select)}
            ListEmptyComponent={empty}
            ListFooterComponent={footer}
          />
        )}
      />
      {plans ? (
        <View
          style={styles.plans}
          onLayout={(event) => setPlansHeight(event.nativeEvent.layout.height)}
        >
          {plans}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  map: { ...StyleSheet.absoluteFillObject },
  content: {
    paddingHorizontal: theme.gap(2),
    paddingBottom: rt.insets.bottom + theme.gap(12),
  },
  plans: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1.5),
    paddingBottom: rt.insets.bottom + theme.gap(1),
    backgroundColor: theme.colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
  },
}));
