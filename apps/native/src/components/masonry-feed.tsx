import { FlashList } from "@shopify/flash-list";
import { Link } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { ItemCard, type FeedItem, type ItemSource } from "./item-card";

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
}: Props) {
  const { theme } = useUnistyles();
  return (
    <FlashList
      data={items}
      masonry
      numColumns={numColumns}
      optimizeItemArrangement
      keyExtractor={(item) => item._id}
      renderItem={({ item, index }) =>
        firstItemZoomTarget && index === 0 ? (
          <Link.AppleZoomTarget>
            <ItemCard item={item} source={source} />
          </Link.AppleZoomTarget>
        ) : (
          <ItemCard item={item} source={source} />
        )
      }
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        flexGrow: items.length === 0 ? 1 : undefined,
        paddingHorizontal: 0,
        paddingTop: 8,
        paddingBottom: 8,
      }}
      onEndReached={onEndReached}
      onEndReachedThreshold={1}
      ListEmptyComponent={listEmptyComponent}
      ListHeaderComponent={listHeaderComponent}
      ListFooterComponent={
        loadingMore ? (
          <View style={styles.footer}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
          </View>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create((theme) => ({
  footer: {
    paddingVertical: theme.gap(2),
    alignItems: "center",
  },
}));
