import { EmptyState } from '@/components/empty-state';
import { MasonryFeed } from '@/components/masonry-feed';
import { ScreenLoader } from '@/components/ui/screen-loader';
import { useHomeFeed } from '@/lib/home-feed';
import { useReviewPrompt } from '@/lib/review-prompt';
import { ProgressiveBlurHeader } from 'progressive-blur';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

export default function HomeScreen() {
  const { items, canLoadMore, loadingMore, loadMore } = useHomeFeed();
  useReviewPrompt(items);

  if (items === undefined) {
    return (
      <ScreenLoader label="Warming your shelf" />
    );
  }

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Save it for later"
          message={'Tap + to drop in a link, a photo, or a stray thought.\nShelvr keeps it warm until you need it.'}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MasonryFeed
        items={items}
        numColumns={2}
        source={{ from: 'home' }}
        onEndReached={canLoadMore ? loadMore : undefined}
        loadingMore={loadingMore}
      />
      <ProgressiveBlurHeader />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,

  },
}));
