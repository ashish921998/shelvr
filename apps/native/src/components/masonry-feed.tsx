import { FlashList } from "@shopify/flash-list";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ItemCard, type FeedItem, type ItemSource } from "./item-card";
import { StitchRing } from "@/components/ui/stitch-loader";

type Props = {
  items: FeedItem[];
  numColumns?: number;
  source?: ItemSource;
  firstItemZoomTarget?: boolean;
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
