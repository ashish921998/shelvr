// A row of saves standing on one drawn shelf. This is the app's list: cards
// side by side on a board, not a grid.
//
// The shelf is only drawn where two or more saves stand together. A row given
// a single card still draws its board — a shelf row is by definition a place
// where saves gather; an item page, which shows one save on its own, uses no
// shelf at all.

import { useMemo } from "react";
import { ScrollView, View } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { InkShelf, SHELF_HEIGHT } from "@/components/ink/ink-shelf";
import {
  StandingCard,
  type StandingCardProps,
} from "@/components/shelf/standing-card";
import type { PropKind } from "@/lib/ink/strokes";

export { SHELF_HEIGHT };

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
  testID,
}: {
  cards: readonly ShelfCard[];
  /** The shelf's own width. The cards scroll within it; the board does not. */
  width: number;
  clock?: SharedValue<number>;
  seed?: number;
  prop?: PropKind;
  scrollable?: boolean;
  testID?: string;
}) {
  const content = useMemo(
    () =>
      cards.map(({ key, ...card }, index) => (
        <StandingCard key={key} {...card} index={index} clock={clock} />
      )),
    [cards, clock],
  );

  return (
    <View style={styles.row} testID={testID}>
      {scrollable ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cards}
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
