import { t, useAppLocale, formattingLocale } from "@/lib/i18n";
import { InkSpinner } from "@/components/ink/ink-thread";
import { ReadingMeter } from "@/components/ink/reading-meter";
import { TagChip } from "@/components/tag-chip";
import { ProductsSection } from "@/components/products-section";
import { RecipeSection } from "@/components/recipe-section";
import { ItemSpaces } from "@/components/item-spaces";
import { PostMediaButton } from "@/components/post-media-button";
import { analytics } from "@/lib/analytics";
import { displayHost } from "@/lib/url";
import { SimilarGrid } from "@/components/similar-grid";
import type { DetailItem } from "@/components/item-detail";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { AppSymbolIcon } from "@/components/symbol";
import * as WebBrowser from "expo-web-browser";
import type { Id } from "@convex/_generated/dataModel";
import { Fragment, useMemo, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Space = { _id: Id<"spaces">; name: string };

type ArticleMedia = NonNullable<DetailItem["articleMedia"]>[number];

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
  useAppLocale();
  const { theme } = useUnistyles();
  const insets = useSafeAreaInsets();
  const [tagsExpanded, setTagsExpanded] = useState(false);
  // How far through the article the reader is, rounded to 2% so scrolling
  // does not re-render the meter on every frame.
  const [readProgress, setReadProgress] = useState(0);
  const window = useWindowDimensions();

  // Media after the last stored paragraph shows at the end.
  const mediaByParagraph = useMemo(() => {
    const byParagraph = new Map<number, ArticleMedia[]>();
    for (const media of item.articleMedia ?? []) {
      const at = Math.min(media.paragraph, paragraphs.length);
      byParagraph.set(at, [...(byParagraph.get(at) ?? []), media]);
    }
    return byParagraph;
  }, [item.articleMedia, paragraphs.length]);

  const openSource = () => {
    void WebBrowser.openBrowserAsync(item.url!)
      .then(() => analytics.itemAction(item, "open_source"))
      .catch(() => {});
  };

  // Full body width, but a tall video poster stops at 60% of the screen.
  const mediaFrame = (aspectRatio: number) => {
    const width = Math.min(
      window.width - theme.gap(2.5) * 2,
      window.height * 0.6 * aspectRatio,
    );
    return { width, height: width / aspectRatio };
  };

  const mediaAt = (paragraph: number) =>
    mediaByParagraph.get(paragraph)?.map((media, index) => {
      const image = (
        <Image
          source={{ uri: media.imageUrl }}
          contentFit="cover"
          style={[styles.articleMedia, mediaFrame(media.aspectRatio)]}
        />
      );
      return (
        <View key={`media-${index}`} style={styles.articleMediaRow}>
          {media.kind !== "photo" && item.url ? (
            <PostMediaButton
              site={item.siteName ?? displayHost(item.url)}
              playable
              onPress={openSource}
            >
              {image}
            </PostMediaButton>
          ) : (
            image
          )}
        </View>
      );
    });

  const compactTags = item.tags.slice(0, 2);
  const remainingTagCount = Math.max(item.tags.length - compactTags.length, 0);
  const compactTagLabel = [
    compactTags.join(" · "),
    remainingTagCount > 0
      ? `+${new Intl.NumberFormat(formattingLocale()).format(remainingTagCount)}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const thumbnail = heroUri ? (
    <Image
      source={{ uri: heroUri }}
      contentFit="cover"
      style={styles.thumbnailImage}
    />
  ) : (
    <View style={styles.thumbnailFallback}>
      <AppSymbolIcon
        name="link"
        size={22}
        tintColor={theme.colors.primaryText}
      />
    </View>
  );

  return (
    <ScrollView
      testID={
        item.fixtureKey ? `fixture-item-detail-${item.fixtureKey}` : undefined
      }
      contentInsetAdjustmentBehavior="never"
      style={[styles.container, { paddingTop: headerHeight + theme.gap(1.5) }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + theme.gap(4) }}
      showsVerticalScrollIndicator={false}
      scrollEventThrottle={64}
      onScroll={(event) => {
        const { contentOffset, contentSize, layoutMeasurement } =
          event.nativeEvent;
        const scrollable = contentSize.height - layoutMeasurement.height;
        const ratio = scrollable > 0 ? contentOffset.y / scrollable : 0;
        const stepped = Math.round(Math.min(1, Math.max(0, ratio)) * 50) / 50;
        setReadProgress((current) => (current === stepped ? current : stepped));
      }}
    >
      <View style={styles.body}>
        {item.status === "processing" ? (
          <View style={styles.processingRow}>
            <InkSpinner size={20} />
            <Text style={styles.processingText}>{t("item.reading")}</Text>
          </View>
        ) : null}

        {/* The meter sits where the hairline does, and fills as you read. */}
        <View style={styles.meter}>
          <ReadingMeter
            width={window.width - theme.gap(4)}
            progress={readProgress}
          />
        </View>

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
                  accessibilityLabel={t("item.openSite", {
                    site: item.siteName ?? displayHost(item.url),
                  })}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.source,
                    pressed && styles.pressed,
                  ]}
                  onPress={openSource}
                >
                  <AppSymbolIcon
                    name="safari"
                    size={13}
                    tintColor={theme.colors.muted}
                  />
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
            </View>

            {item.description ? (
              <Text numberOfLines={2} style={styles.description}>
                {item.description}
              </Text>
            ) : null}

            {item.tags.length > 0 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t(
                  tagsExpanded ? "item.hideTags" : "item.showTags",
                  { tags: item.tags.join(", ") },
                )}
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
                  {tagsExpanded ? t("common.hide") : t("item.tags")}
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

        {item.status === "ready" ? <ItemSpaces spaces={spaces} /> : null}

        {/* A recipe page replaces the article body: the classifier already
            lifted the ingredients and steps out of the story around them. The
            article's own images go with that story, since their positions are
            paragraph-relative and the paragraphs are gone. */}
        {item.recipe ? (
          <RecipeSection recipe={item.recipe} />
        ) : (
          <View style={styles.article}>
            {paragraphs.map((paragraph, index) => (
              <Fragment key={index}>
                {mediaAt(index)}
                <Text
                  selectable
                  style={[styles.paragraph, index === 0 && styles.lede]}
                >
                  {paragraph}
                </Text>
              </Fragment>
            ))}
            {mediaAt(paragraphs.length)}
          </View>
        )}

        {item.status === "ready" ? <ProductsSection item={item} /> : null}

        {similar && similar.length > 0 ? (
          <View style={styles.similarSection}>
            <Text style={styles.similarTitle}>{t("item.similar")}</Text>
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
  meter: { paddingBottom: theme.gap(1.5) },
  summary: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  thumbnailFrame: {
    width: 104,
    height: 72,
    flexShrink: 0,
    padding: 4,
    overflow: "hidden",
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: "white",
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,
  },
  thumbnailImage: {
    width: "100%",
    height: "100%",
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  thumbnailFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  sourceLine: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 6,
  },
  source: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sourceText: {
    minWidth: 0,
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    color: theme.colors.muted,
  },
  description: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 18,
    color: theme.colors.foreground,
  },
  tagsTrigger: {
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    flexDirection: "row",
    flexWrap: "wrap",
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
  articleMediaRow: {
    alignItems: "center",
  },
  articleMedia: {
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
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
