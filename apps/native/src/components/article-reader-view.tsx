import { TagChip } from '@/components/tag-chip';
import { displayHost } from '@/lib/url';
import { SimilarGrid } from '@/components/similar-grid';
import type { DetailItem } from '@/components/item-detail';
import { Image } from 'expo-image';
import { Link, useRouter } from 'expo-router';
import { AppSymbolIcon } from '@/components/symbol';
import * as WebBrowser from 'expo-web-browser';
import type { Id } from '@convex/_generated/dataModel';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

type Space = { _id: Id<'spaces'>; name: string };

type Props = {
  item: DetailItem;
  isZoomTarget: boolean;
  headerHeight: number;
  spaces: Space[];
  similar: DetailItem[] | undefined;
  heroUri: string | undefined;
  paragraphs: string[];
};

// Compact reading layout for link saves with extracted article content. Keeps
// metadata (thumbnail, source, description, tags) in a single summary row so
// the full article begins in the first quarter of the screen. Extracted from
// ItemDetail to keep each render path independently scannable.
export function ArticleReaderView({
  item,
  isZoomTarget,
  headerHeight,
  spaces,
  similar,
  heroUri,
  paragraphs,
}: Props) {
  const router = useRouter();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const [tagsExpanded, setTagsExpanded] = useState(false);

  const compactTags = item.tags.slice(0, 2);
  const remainingTagCount = Math.max(item.tags.length - compactTags.length, 0);
  const compactTagLabel = [
    compactTags.join(' · '),
    remainingTagCount > 0 ? `+${remainingTagCount}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const thumbnail = heroUri ? (
    <Image
      source={{ uri: heroUri }}
      contentFit="cover"
      style={styles.thumbnailImage}
    />
  ) : (
    <View style={styles.thumbnailFallback}>
      <AppSymbolIcon name="link" size={22} tintColor={theme.colors.primaryText} />
    </View>
  );

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="never"
      style={[styles.container, { paddingTop: headerHeight + theme.gap(1.5) }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + theme.gap(4) }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.body}>
        {item.status === 'processing' ? (
          <View style={styles.processingRow}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.processingText}>Shelvr is reading this…</Text>
          </View>
        ) : null}

        <View style={styles.summary}>
          <View style={styles.thumbnailFrame}>
            {isZoomTarget ? (
              <Link.AppleZoomTarget>{thumbnail}</Link.AppleZoomTarget>
            ) : (
              thumbnail
            )}
          </View>

          <View style={styles.summaryCopy}>
            <View style={styles.sourceLine}>
              {item.url ? (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={`Open ${item.siteName ?? displayHost(item.url)}`}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.source,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => WebBrowser.openBrowserAsync(item.url!)}
                >
                  <AppSymbolIcon name="safari" size={13} tintColor={theme.colors.muted} />
                  <Text numberOfLines={1} style={styles.sourceText}>
                    {item.siteName ?? displayHost(item.url)}
                  </Text>
                  <AppSymbolIcon
                    name="arrow.up.right"
                    size={10}
                    tintColor={theme.colors.faint}
                  />
                </Pressable>
              ) : null}

              {item.status === 'ready' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    spaces.length > 0 ? 'Manage spaces' : 'Add to space'
                  }
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.spaceChip,
                    pressed && styles.pressed,
                  ]}
                  onPress={() =>
                    router.push({
                      pathname: '/manage-spaces',
                      params: { itemId: item._id },
                    })
                  }
                >
                  <AppSymbolIcon
                    name="plus"
                    size={10}
                    tintColor={theme.colors.primaryText}
                  />
                  <Text numberOfLines={1} style={styles.spaceLabel}>
                    {spaces.length > 0 ? 'Spaces' : 'Add to space'}
                  </Text>
                </Pressable>
              ) : null}
            </View>

            {item.description ? (
              <Text numberOfLines={2} style={styles.description}>
                {item.description}
              </Text>
            ) : null}

            {item.tags.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${tagsExpanded ? 'Hide' : 'Show'} tags: ${item.tags.join(', ')}`}
                accessibilityState={{ expanded: tagsExpanded }}
                hitSlop={6}
                onPress={() => setTagsExpanded(!tagsExpanded)}
                style={({ pressed }) => [
                  styles.tagsTrigger,
                  pressed && styles.pressed,
                ]}
              >
                <Text numberOfLines={1} style={styles.tagsText}>
                  {compactTagLabel}
                </Text>
                <Text style={styles.tagsAction}>
                  {tagsExpanded ? 'Hide' : 'Tags'}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        {tagsExpanded ? (
          <View style={styles.expandedTags}>
            {item.tags.map((tag) => (
              <TagChip key={tag} label={tag} />
            ))}
          </View>
        ) : null}

        <View style={styles.article}>
          {paragraphs.map((paragraph, index) => (
            <Text
              selectable
              key={index}
              style={[styles.paragraph, index === 0 && styles.lede]}
            >
              {paragraph}
            </Text>
          ))}
        </View>

        {similar && similar.length > 0 ? (
          <View style={styles.similarSection}>
            <Text style={styles.similarTitle}>More like this</Text>
            <SimilarGrid items={similar} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  body: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2.5),
  },
  summary: {
    minHeight: 76,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(1.5),
  },
  thumbnailFrame: {
    width: 104,
    height: 72,
    flexShrink: 0,
    padding: 4,
    overflow: 'hidden',
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: 'white',
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceMuted,
  },
  thumbnailFallback: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.primarySoft,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  sourceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  source: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sourceText: {
    minWidth: 0,
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    color: theme.colors.muted,
  },
  spaceChip: {
    minWidth: 88,
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 50,
    backgroundColor: theme.colors.primarySoft,
  },
  spaceLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    color: theme.colors.primaryText,
  },
  description: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  tagsTrigger: {
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  tagsText: {
    minWidth: 0,
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    color: theme.colors.muted,
  },
  tagsAction: {
    flexShrink: 0,
    fontFamily: theme.fonts.medium,
    fontSize: 10,
    color: theme.colors.primaryText,
  },
  expandedTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.gap(0.75),
  },
  article: {
    gap: theme.gap(2),
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.border,
    paddingTop: theme.gap(2),
  },
  paragraph: {
    fontFamily: theme.fonts.regular,
    fontSize: 18,
    lineHeight: 29,
    color: theme.colors.foreground,
  },
  lede: {
    fontFamily: theme.fonts.medium,
    fontSize: 19,
    lineHeight: 28,
  },
  pressed: {
    opacity: 0.7,
  },
  processingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(1),
  },
  processingText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  similarSection: {
    gap: theme.gap(1),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.gap(2.5),
  },
  similarTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 18,
    color: theme.colors.foreground,
    paddingHorizontal: 4,
  },
}));
