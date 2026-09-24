// A row of saves standing on one drawn shelf. This is the app's list: cards
// side by side on a board, not a grid.
//
// The shelf is only drawn where two or more saves stand together. A row given
// a single card still draws its board — a shelf row is by definition a place
// where saves gather; an item page, which shows one save on its own, uses no
// shelf at all.

import { useMemo, useRef } from "react";
import {
  ScrollView,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { InkShelf } from "@/components/ink/ink-shelf";
import {
  StandingCard,
  type StandingCardProps,
} from "@/components/shelf/standing-card";
import type { PropKind } from "@/lib/ink/strokes";
import { nearRowEnd } from "@/lib/shelf-layout";

export type ShelfCard = Omit<StandingCardProps, "index" | "clock"> & {
  key: string;
};

export function ShelfRow({
  cards,
  width,
  clock,
  seed = 0,
  prop,
  scrollable = true,
  onEndReached,
  testID,
}: {
  cards: readonly ShelfCard[];
  /** The shelf's own width. The cards scroll within it; the board does not. */
  width: number;
  clock?: SharedValue<number>;
  seed?: number;
  prop?: PropKind;
  scrollable?: boolean;
  /** Called when the reader nears the last card, or when the row is too short
   * to scroll. The row grows sideways, so this is where a paged feed asks for
   * more. Fires once per content width, so a slow page is not asked for twice. */
  onEndReached?: () => void;
  testID?: string;
}) {
  const content = useMemo(
    () =>
      cards.map(({ key, ...card }, index) => (
        <StandingCard key={key} {...card} index={index} clock={clock} />
      )),
    [cards, clock],
  );

  const scrolledX = useRef(0);
  const rowWidth = useRef(0);
  const contentWidth = useRef(0);
  const requestedAt = useRef(-1);
  const checkEnd = () => {
    if (!onEndReached || requestedAt.current === contentWidth.current) return;
    if (
      !nearRowEnd({
        offset: scrolledX.current,
        layout: rowWidth.current,
        content: contentWidth.current,
      })
    ) {
      return;
    }
    requestedAt.current = contentWidth.current;
    onEndReached();
  };

  return (
    <View style={styles.row} testID={testID}>
      {scrollable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
          scrollEventThrottle={100}
          onScroll={(event: NativeSyntheticEvent<NativeScrollEvent>) => {
            scrolledX.current = event.nativeEvent.contentOffset.x;
            checkEnd();
          }}
          onLayout={(event: LayoutChangeEvent) => {
            rowWidth.current = event.nativeEvent.layout.width;
            checkEnd();
          }}
          onContentSizeChange={(width: number) => {
            contentWidth.current = width;
            checkEnd();
          }}
        >
          {content}
        </ScrollView>
      ) : (
        <View style={styles.cards}>{content}</View>
      )}
      <InkShelf
        width={width}
        clock={clock}
        seed={seed}
        prop={prop}
        style={styles.shelf}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: "flex-start" },
  cards: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 6,
  },
  // The board overlaps the cards slightly so they stand on it, not above it.
  shelf: { marginTop: -4 },
});
