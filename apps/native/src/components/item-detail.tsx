import { isTerminalFailure } from "@convex/model/itemFields";
import { IMAGE_TOO_LARGE_MESSAGE } from "@convex/model/imagePolicy";
import { ProductsSection } from '@/components/products-section';
import { ArticleReaderView } from '@/components/article-reader-view';
import { ItemSpaces } from '@/components/item-spaces';
import { analytics } from '@/lib/analytics';
import { IntentChip } from '@/components/intent-chip';
import { SimilarGrid } from '@/components/similar-grid';
import { TagChip } from '@/components/tag-chip';
import { usePaywallGuard } from '@/lib/entitlement';
import { useAppHeaderHeight } from '@/lib/header-layout';
import { runIntent } from '@/lib/intents';
import { displayHost } from '@/lib/url';
import { isTikTokUrl } from '@convex/model/externalUrl';
import { convexQuery } from '@convex-dev/react-query';
import { api } from '@convex/_generated/api';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { AppSymbolIcon } from '@/components/symbol';
import * as WebBrowser from 'expo-web-browser';
import type { FunctionReturnType } from 'convex/server';
import { memo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// A row as returned by the list queries (listItems / searchItems / getSpace) —
// carries every display field except the space memberships, which only
// getItem resolves. Rows from getSpace additionally carry `spaceIntents`:
// purpose-steered actions scoped to that space's membership.
export type DetailItem = FunctionReturnType<typeof api.items.listItems>[number] & {
  spaceIntents?: FunctionReturnType<typeof api.items.listItems>[number]['intents'];
};

type Props = {
  item: DetailItem;
  // Only the page matching the pushed id owns the Apple-zoom transition target;
  // pairing more than one target with a single push confuses the animation.
  isZoomTarget: boolean;
};

// Shared data for both render paths: space memberships (fetched separately
// since list rows don't carry them), similar items, the hero URI, and parsed
// article paragraphs.
function useItemDetailData(item: DetailItem) {
  const { data: withSpaces } = useQuery(
    convexQuery(api.items.getItem, { id: item._id }),
  );
  const spaces = withSpaces?.spaces ?? [];

  // Lexical-similarity strip for the bottom of the page (v0 — a vector index
  // upgrade slots in behind the same query). Only ready items have signal.
  const { data: similar } = useQuery({
    ...convexQuery(api.items.similarItems, { id: item._id }),
    enabled: item.status === 'ready',
  });

  const heroUri = item.imageUrl ?? item.heroImageUrl;

  const paragraphs =
    item.content
      ?.split(/\n{2,}/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0) ?? [];

  return { spaces, similar, heroUri, paragraphs };
}

// Memoized: this is a FlashList page in a horizontal pager, and its `item` ref
// is stable across swipes (Convex query data, staleTime Infinity). Without this,
// every parent re-render (setActiveId on each swipe) re-rendered every mounted
// page and its ~100+ paragraph Text nodes — the dominant swipe cost profiled.
export const ItemDetail = memo(function ItemDetail({ item, isZoomTarget }: Props) {
  const headerHeight = useAppHeaderHeight();
  const { theme } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const { spaces, similar, heroUri, paragraphs } = useItemDetailData(item);

  // A video's "content" is its caption, not an article: keep the poster layout.
  const isVideo = item.type === 'link' && isTikTokUrl(item.url);

  // Link saves with extracted content get the compact reader layout.
  if (item.type === 'link' && !isVideo && paragraphs.length > 0) {
    return (
      <ArticleReaderView
        item={item}
        isZoomTarget={isZoomTarget}
        headerHeight={headerHeight}
        spaces={spaces}
        similar={similar}
        heroUri={heroUri}
        paragraphs={paragraphs}
      />
    );
  }

  // The item's own actions, plus any purpose-steered ones from the space this
  // page was opened through (deduped — steering may echo a general intent).
  const intents = (() => {
    const base = item.intents ?? [];
    const scoped = item.spaceIntents ?? [];
    const seen = new Set(base.map((i) => `${i.kind}|${i.value.toLowerCase()}`));
    return [
      ...base,
      ...scoped.filter((i) => !seen.has(`${i.kind}|${i.value.toLowerCase()}`)),
    ];
  })();

  // Cap the hero so a tall portrait image can't fill the whole screen and hide
  // the title, description, and actions below it.
  const maxHeroHeight = height * 0.55;

  // Source shape; OG images default to 1200×630 (≈1.91).
  const heroAspect =
    item.aspectRatio ?? (isVideo ? 9 / 16 : item.type === 'link' ? 1.91 : 1.4);

  // Size the framed photo up front from its aspect ratio: fill the width the
  // frame allows, but never taller than the cap — and when the cap bites, pull
  // the width back in too so the image keeps its shape and the frame hugs it
  // (no cropping, no lopsided gap). The frame insets the image by its own
  // horizontal margin + padding.
  const frameInset = theme.gap(2) * 2 + theme.gap(1) * 2;
  const heroMaxWidth = width - frameInset;
  const heroHeight = Math.min(heroMaxWidth / heroAspect, maxHeroHeight);
  const heroWidth = heroHeight * heroAspect;

  const heroImage = heroUri ? (
    <Image
      source={{ uri: heroUri }}
      contentFit="contain"
      style={
        item.isSticker
          ? [styles.hero, { aspectRatio: heroAspect, maxHeight: maxHeroHeight }]
          : [styles.heroImage, { width: heroWidth, height: heroHeight }]
      }
    />
  ) : null;

  // The poster is the video's one real action: tap anywhere on it to open.
  const hero =
    heroImage && isVideo && item.url ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Play on TikTok"
        onPress={() => {
          void WebBrowser.openBrowserAsync(item.url!).then(() => analytics.itemAction(item, 'open_source')).catch(() => {});
        }}
      >
        {heroImage}
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playButton}>
            <AppSymbolIcon name="play.fill" size={26} tintColor="white" />
          </View>
        </View>
      </Pressable>
    ) : (
      heroImage
    );

  return (
    <ScrollView
      testID={item.fixtureKey ? `fixture-item-detail-${item.fixtureKey}` : undefined}
      contentInsetAdjustmentBehavior="never"
      style={[styles.container, { paddingTop: headerHeight + theme.gap(5) }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + theme.gap(4) }}
      showsVerticalScrollIndicator={false}
    >
      {heroUri ? (
        <View style={item.isSticker ? undefined : styles.heroContainer}>
          {isZoomTarget ? <Link.AppleZoomTarget>{hero}</Link.AppleZoomTarget> : hero}
        </View>
      ) : null}

      <View
        style={[
          styles.body,
          // Without a hero to sit under, the text needs to clear the notch and
          // the floating controls.
          { paddingTop: heroUri ? theme.gap(5) : headerHeight + theme.gap(5) },
        ]}
      >
        <SaveStatusNotice item={item} />

        {item.status === 'ready' ? <ItemSpaces itemId={item._id} spaces={spaces} /> : null}

        {item.url ? (
          <View style={styles.titleContainer}>
            <Pressable
              style={styles.sourceRow}
              onPress={() => {
                void WebBrowser.openBrowserAsync(item.url!).then(() => analytics.itemAction(item, 'open_source')).catch(() => {});
              }}
            >
              <AppSymbolIcon
                name={isVideo ? 'play.rectangle' : 'safari'}
                size={15}
                tintColor={theme.colors.muted}
              />
              <Text style={styles.sourceText}>
                {isVideo && item.author
                  ? `${item.author} · TikTok`
                  : (item.siteName ?? displayHost(item.url))}
              </Text>
              <AppSymbolIcon
                name="arrow.up.right"
                size={11}
                tintColor={theme.colors.faint}
              />
            </Pressable>
          </View>
        ) : null}

        {intents.length > 0 ? (
          <View style={styles.intentsRow}>
            {intents.map((intent, index) => (
              <IntentChip
                key={`${intent.kind}-${index}`}
                kind={intent.kind}
                label={intent.label}
                onPress={() => {
                  void runIntent(intent.kind, intent.value).then(() => {
                    analytics.itemAction(item, intent.kind === 'open_url' ? 'open_source' : intent.kind === 'add_event' ? 'calendar_sheet_opened' : intent.kind);
                  }).catch(() => {});
                }}
              />
            ))}
          </View>
        ) : null}

        {item.description ? (
          <Text style={styles.description}>{item.description}</Text>
        ) : null}

        {item.url && !item.content ? (
          // No article body came back, so the address itself is the content —
          // show it as a real, tappable row instead of a sparse gap.
          <Pressable
            style={styles.urlRow}
            accessibilityRole="link"
            onPress={() => {
              void WebBrowser.openBrowserAsync(item.url!).then(() => analytics.itemAction(item, 'open_source')).catch(() => {});
            }}
            hitSlop={4}
          >
            <AppSymbolIcon name="link" size={11} tintColor={theme.colors.faint} />
            <Text style={styles.urlText} numberOfLines={2}>
              {item.url}
            </Text>
          </Pressable>
        ) : null}

        {isVideo && paragraphs.length > 0 ? (
          <Text selectable style={styles.paragraph}>
            {paragraphs.join('\n\n')}
          </Text>
        ) : null}

        {item.tags.length > 0 ? (
          <View style={styles.chipsRow}>
            {item.tags.map((tag) => (
              <TagChip key={tag} label={tag} />
            ))}
          </View>
        ) : null}

        {item.status === 'ready' ? (
          <ProductsSection item={item} />
        ) : null}

        {item.type === 'note' && item.note ? (
          <Text selectable style={styles.paragraph}>
            {item.note}
          </Text>
        ) : null}

        {!isVideo && paragraphs.length > 0 ? (
          <View style={styles.article}>
            {paragraphs.map((paragraph, index) => (
              <Text selectable key={index} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}
          </View>
        ) : null}

        {similar && similar.length > 0 ? (
          <View style={styles.similarSection}>
            <Text style={styles.similarTitle}>More like this</Text>
            <SimilarGrid items={similar} />
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
});

/** How the save itself went, derived once from the item's pipeline fields so
 * the rendering below stays a flat switch. */
type SaveState = 'image_too_large' | 'gone' | 'failed' | 'partial' | 'no_article';

function saveState(item: DetailItem): SaveState | null {
  if (item.status === 'failed') {
    if (item.failureReason === 'image_too_large') return 'image_too_large';
    // Missing sources cannot be recovered by retrying.
    return item.failureReason === 'not_found' ? 'gone' : 'failed';
  }
  if (item.status !== 'ready') {
    return null;
  }
  if (item.enrichment === 'partial') {
    return 'partial';
  }
  // The page loaded but had no extractable article: the URL itself is the
  // save. Explained, but not retryable — a re-run would reach the same result.
  return item.enrichment === 'no_article' ? 'no_article' : null;
}

const SAVE_STATE_NOTICE: Record<SaveState, string> = {
  image_too_large:
    IMAGE_TOO_LARGE_MESSAGE,
  gone: 'This page is gone — it was deleted, or the link was wrong.',
  failed: "Shelvr couldn't read this page.",
  partial:
    "Saved from the link alone — the page wouldn't load, so these details are a guess.",
  no_article:
    'This page has no readable article — saved as a plain link.',
};

/**
 * How the save itself went: still reading, unreadable, gone, or enriched from
 * the URL alone. Without this a failed item renders as an untitled page with no
 * explanation and no way forward, indistinguishable from one still processing.
 *
 * A `not_found` page is gone for good, so it gets no retry — only a reason.
 */
function SaveStatusNotice({ item }: { item: DetailItem }) {
  const { theme } = useUnistyles();
  const reprocess = useMutation(api.items.reprocessItem);
  const { guard, loading: entitlementLoading } = usePaywallGuard('item_detail');
  // Guards the retry gesture: disabled while in flight, and a rejection gets
  // user-visible feedback instead of an unhandled promise.
  const [retrying, setRetrying] = useState(false);

  if (item.status === 'processing') {
    return (
      <View style={styles.processingRow}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.processingText}>Shelvr is reading this…</Text>
      </View>
    );
  }

  const state = saveState(item);
  if (state === null) {
    return null;
  }

  return (
    <View style={styles.noticeRow}>
      <AppSymbolIcon
        name={state === 'no_article' ? 'info.circle' : 'exclamationmark.triangle.fill'}
        size={14}
        tintColor={
          state === 'gone'
            ? theme.colors.faint
            : state === 'no_article'
              ? theme.colors.muted
              : theme.colors.danger
        }
      />
      <Text style={styles.noticeText}>
        {state === 'gone' && item.type === 'image'
          ? 'This photo is unavailable or empty. Please save it again.'
          : state === 'failed' && item.type !== 'link'
            ? `Shelvr couldn't read this ${item.type === 'image' ? 'photo' : 'note'}.`
            : SAVE_STATE_NOTICE[state]}
      </Text>
      {isTerminalFailure(item.failureReason) || state === 'no_article' ? null : (
        <Pressable
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
          onPress={() =>
            guard(async () => {
              setRetrying(true);
              try {
                await reprocess({ id: item._id });
              } catch {
                Alert.alert("Couldn't retry", 'Please try again in a moment.');
              } finally {
                setRetrying(false);
              }
            })
          }
          disabled={retrying || entitlementLoading}
          hitSlop={6}
        >
          {retrying ? (
            <ActivityIndicator size="small" color={theme.colors.primaryText} />
          ) : (
            <AppSymbolIcon name="arrow.clockwise" size={12} tintColor={theme.colors.primaryText} />
          )}
          <Text style={styles.chipLabel}>Try again</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  hero: {
    width: '100%',
    // Full-bleed so the card image (a die-cut sticker) zooms edge-to-edge.
  },
  // Non-sticker heroes get the same white matted frame as the home cards, so
  // the padded look carries through the Apple zoom into this screen.
  heroContainer: {
    backgroundColor: 'white',
    // Hug the image so a capped portrait sits as a centered card rather than
    // leaving a gap in a full-width frame.
    alignSelf: 'center',
    marginHorizontal: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
    padding: theme.gap(1),
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,
  },
  heroImage: {
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surfaceMuted,
  },
  playOverlay: {
    position: 'absolute',
    inset: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    // Nudge the glyph to the optical center of the circle.
    paddingLeft: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  body: {
    gap: theme.gap(5),
    paddingHorizontal: theme.gap(2),
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
  noticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: theme.gap(1),
  },
  noticeText: {
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  titleContainer: {
    gap: theme.gap(1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sourceText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
  description: {
    fontFamily: theme.fonts.medium,
    fontSize: 17,
    lineHeight: 25,
    textAlign: 'center',
    color: theme.colors.muted,
  },
  urlRow: {
    maxWidth: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    alignSelf: 'center',
    paddingHorizontal: theme.gap(1),
  },
  urlText: {
    flexShrink: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    color: theme.colors.faint,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.gap(0.75),
    justifyContent: 'center',
  },
  intentsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.gap(1),
    justifyContent: 'center',
  },
  article: {
    gap: theme.gap(1.5),
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: theme.gap(2),
  },
  paragraph: {
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    lineHeight: 25,
    color: theme.colors.foreground,
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
  // Shared pill for the detail screen's small actions (retry a failed save,
  // find shopping links).
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primarySoft,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 50,
  },
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
}));
