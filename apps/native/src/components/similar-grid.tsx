import type { DetailItem } from '@/components/item-detail';
import { displayHost } from '@/lib/url';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

// A static two-column masonry for the similar-items strip. The parent page
// already scrolls, so a nested virtualized list would be invalid. Keeping this
// component outside item-detail also prevents a runtime import cycle with the
// article-reader render path.
export function SimilarGrid({ items }: { items: DetailItem[] }) {
  const columns: [DetailItem[], DetailItem[]] = [[], []];
  const heights = [0, 0];
  for (const item of items) {
    const ratio = Math.min(
      Math.max(item.aspectRatio ?? (item.type === 'link' ? 1.91 : 1), 0.5),
      2,
    );
    const column = heights[0] <= heights[1] ? 0 : 1;
    columns[column].push(item);
    heights[column] += 1 / ratio;
  }
  return (
    <View style={styles.similarGrid}>
      {columns.map((column, index) => (
        <View key={index} style={styles.similarColumn}>
          {column.map((item) => (
            <View key={item._id} style={styles.similarCell}>
              <SimilarItemCard item={item} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function SimilarItemCard({ item }: { item: DetailItem }) {
  const imageUri = item.imageUrl ?? item.heroImageUrl;
  const aspectRatio = Math.min(
    Math.max(item.aspectRatio ?? (item.type === 'link' ? 1.91 : 1), 0.5),
    2,
  );
  const title = item.title ?? item.note ?? (item.url ? displayHost(item.url) : 'Untitled item');

  return (
    <Link href={{ pathname: '/item/[id]', params: { id: item._id } }} asChild>
      <Pressable
        style={({ pressed }) => [
          styles.similarCard,
          item.isSticker && styles.similarCardSticker,
          pressed && styles.similarCardPressed,
        ]}
      >
        {imageUri ? (
          item.isSticker ? (
            <Image
              source={{ uri: imageUri }}
              contentFit="contain"
              style={[styles.similarSticker, { aspectRatio }]}
            />
          ) : (
            <View style={styles.similarImageFrame}>
              <Image
                source={{ uri: imageUri }}
                contentFit="cover"
                style={[styles.similarImage, { aspectRatio }]}
              />
            </View>
          )
        ) : (
          <View style={[styles.similarTextFace, item.type === 'note' && styles.similarNoteFace]}>
            <Text style={styles.similarTextFaceTitle} numberOfLines={4}>
              {title}
            </Text>
          </View>
        )}
        <Text style={styles.similarCardTitle} numberOfLines={2}>
          {title}
        </Text>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create((theme) => ({
  similarGrid: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginHorizontal: -4,
  },
  similarColumn: {
    flex: 1,
  },
  similarCell: {
    padding: 4,
  },
  similarCard: {
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  similarCardSticker: {
    overflow: 'visible',
  },
  similarCardPressed: {
    opacity: 0.85,
  },
  similarImageFrame: {
    backgroundColor: 'white',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    padding: theme.gap(0.5),
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,
  },
  similarImage: {
    width: '100%',
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceMuted,
  },
  similarSticker: {
    width: '100%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  similarTextFace: {
    minHeight: 96,
    justifyContent: 'center',
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceMuted,
  },
  similarNoteFace: {
    backgroundColor: theme.colors.primarySoft,
  },
  similarTextFaceTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  similarCardTitle: {
    paddingHorizontal: theme.gap(0.5),
    paddingTop: theme.gap(0.75),
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    lineHeight: 12,
    color: theme.colors.foreground,
  },
}));
