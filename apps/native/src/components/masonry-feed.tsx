import { FlashList } from "@shopify/flash-list";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ItemCard, type FeedItem, type ItemSource } from "./item-card";
import { StitchRing } from "@/components/ui/stitch-loader";

type Props = {
  items: FeedItem[];
  numColumns?: number;
  source?: ItemSource;
  // Marks the first item (top-left) as the Apple-zoom landing target, so a
  // withAppleZoom link that pushed this screen zooms into where the feed begins.
  firstItemZoomTarget?: boolean;
  // Paginated feeds ask for the next page as the user nears the bottom; leave
  // unset when there is nothing more to load.
  onEndReached?: () => void;
  loadingMore?: boolean;
  ListEmptyComponent?: React.ComponentType | React.ReactElement;
  ListHeaderComponent?: React.ComponentType | React.ReactElement;
  onScrollBeginDrag?: () => void;
};

export function MasonryFeed({
  items,
  numColumns = 2,
  source,
  firstItemZoomTarget,
  onEndReached,
  loadingMore,
  ListEmptyComponent: listEmptyComponent,
  ListHeaderComponent: listHeaderComponent,
  onScrollBeginDrag,
}: Props) {
  const { theme } = useUnistyles();
  return (
    <FlashList
      data={items}
      maintainVisibleContentPosition={{ disabled: source?.from === "search" }}
      masonry
      numColumns={numColumns}
      optimizeItemArrangement
      keyExtractor={(item) => item._id}
      renderItem={({ item, index }) => (
        <ItemCard
          item={item}
          source={source}
          zoomTarget={firstItemZoomTarget === true && index === 0}
        />
      )}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onScrollBeginDrag={onScrollBeginDrag}
      // Each cell pads 4, so 12 here puts the outer cards 16 from the screen
      // edge, the same margin as the headers and every other page.
      contentContainerStyle={{
        flexGrow: items.length === 0 ? 1 : undefined,
        paddingHorizontal: theme.gap(1.5),
        paddingTop: 8,
        paddingBottom: 8,
      }}
      onEndReached={onEndReached}
      onEndReachedThreshold={1}
      ListEmptyComponent={listEmptyComponent}
      ListHeaderComponent={listHeaderComponent}
      // Headers already inset themselves 16, so they step back out of the
      // grid's padding instead of doubling it.
      ListHeaderComponentStyle={styles.edgeToEdge}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <StitchRing />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  edgeToEdge: {
    marginHorizontal: -theme.gap(1.5),
  },
  footer: {
    paddingVertical: theme.gap(2),
    alignItems: "center",
  },
}));
