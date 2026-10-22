import type { TextMessageKey } from "@/locales/message-types";
import { t, useAppLocale } from "@/lib/i18n";
import { isStaleProcessing, isTerminalFailure } from "@convex/model/itemFields";
import { saveErrorCode } from "@convex/model/saveErrors";
import { ProductsSection } from "@/components/products-section";
import { RecipeSection } from "@/components/recipe-section";
import { ArticleReaderView } from "@/components/article-reader-view";
import { SiteButton, SitePanel } from "@/components/site-panel";
import { ItemSpaces } from "@/components/item-spaces";
import { MediaViewerPage } from "@/components/media-viewer-page";
import { PostMediaButton } from "@/components/post-media-button";
import { NoteEditor } from "@/components/note-editor";
import { analytics } from "@/lib/analytics";
import { IntentChip } from "@/components/intent-chip";
import { SimilarGrid } from "@/components/similar-grid";
import { TagChip } from "@/components/tag-chip";
import { ItemSourceLink, openItemSource } from "@/components/item-source-link";
import { usePaywallGuard } from "@/lib/entitlement";
import { useAppHeaderHeight } from "@/lib/header-layout";
import { runIntent } from "@/lib/intents";
import { withoutSourceLink } from "@/lib/source-link";
import { fitMedia, isMediaSave } from "@/lib/media-viewer";
import { socialPost, type SocialPost } from "@/lib/social-post";
import { isYouTubeVideoUrl } from "@/lib/url";
import { letterboxedVideoRatio } from "@/lib/aspect-ratio";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { Image } from "expo-image";
import { Link } from "expo-router";
import { AppSymbolIcon } from "@/components/symbol";
import type { FunctionReturnType } from "convex/server";
import {
  memo,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { StitchRing } from "@/components/ui/stitch-loader";

type CardRow = FunctionReturnType<
  typeof api.items.listItemsPage
>["page"][number];
type FullRow = NonNullable<FunctionReturnType<typeof api.items.getItem>>;

export type DetailItem = CardRow &
  Partial<
    Pick<
      FullRow,
      "content" | "articleMedia" | "recipe" | "products" | "productsStatus"
    >
  > & {
    spaceIntents?: CardRow["intents"];
  };

type Props = {
  item: DetailItem;
  // More than one Apple-zoom target for a single push confuses the animation.
  isZoomTarget: boolean;
  pageHeight: number;
  reserveFooter: boolean;
  onSheetUnderHeader?: (itemId: string, under: boolean) => void;
};

function useItemDetailData(item: DetailItem) {
  const { data: withSpaces, isError: fullRowFailed } = useQuery(
    convexQuery(api.items.getItem, { id: item._id }),
  );
  const spaces = withSpaces?.spaces ?? [];

  const detail = useMemo<DetailItem>(
    () =>
      withSpaces
        ? { ...item, ...withSpaces, spaceIntents: item.spaceIntents }
        : item,
    [item, withSpaces],
  );

  const bodyPending =
    item.type === "link" &&
    item.content === undefined &&
    withSpaces === undefined &&
    !fullRowFailed;

  // Use the 'skip' sentinel, not `enabled`: a disabled React Query still subscribes through the Convex adapter.
  const similarReady = item.status === "ready" && item.type !== "note";
  const { data: similar } = useQuery({
    ...convexQuery(
      api.items.similarItems,
      similarReady ? { id: item._id } : "skip",
    ),
    gcTime: 30_000,
  });

  const heroUri = item.imageUrl ?? item.heroImageUrl;

  const paragraphs = useMemo(
    () =>
      detail.content
        ?.split(/\n{2,}/)
        .map((p) => p.trim())
        .filter((p) => p.length > 0) ?? [],
    [detail.content],
  );

  return { detail, bodyPending, spaces, similar, heroUri, paragraphs };
}

export const ItemDetail = memo(function ItemDetail({
  item,
  isZoomTarget,
  pageHeight,
  reserveFooter,
  onSheetUnderHeader,
}: Props) {
  useAppLocale();
  const headerHeight = useAppHeaderHeight();
  const { theme } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const headerInset = Platform.OS === "ios" ? headerHeight : 0;

  const { detail, bodyPending, spaces, similar, heroUri, paragraphs } =
    useItemDetailData(item);

  // FlashList can recycle this page instance for a different item.
  const scrollRef = useRef<ScrollViewInstance>(null);
  const scrolledItemRef = useRef(item._id);
  useLayoutEffect(() => {
    if (scrolledItemRef.current === item._id) return;
    scrolledItemRef.current = item._id;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [item._id]);

  const social = socialPost(item);

  if (
    !bodyPending &&
    item.type === "link" &&
    social === undefined &&
    paragraphs.length > 0
  ) {
    return (
      <ArticleReaderView
        item={detail}
        isZoomTarget={isZoomTarget}
        headerHeight={headerInset}
        spaces={spaces}
        similar={similar}
        heroUri={heroUri}
        paragraphs={paragraphs}
      />
    );
  }

  const intents = (() => {
    const base = item.intents ?? [];
    const scoped = item.spaceIntents ?? [];
    const seen = new Set(base.map((i) => `${i.kind}|${i.value.toLowerCase()}`));
    return withoutSourceLink(
      [
        ...base,
        ...scoped.filter(
          (i) => !seen.has(`${i.kind}|${i.value.toLowerCase()}`),
        ),
      ],
      item.url,
    );
  })();

  if (heroUri && isMediaSave(detail)) {
    return (
      <MediaViewerPage
        item={item}
        social={social}
        heroUri={heroUri}
        isZoomTarget={isZoomTarget}
        pageHeight={pageHeight}
        headerInset={headerInset}
        reserveFooter={reserveFooter}
        onSheetUnderHeader={onSheetUnderHeader}
        scrollRef={scrollRef}
        testID={
          item.fixtureKey ? `fixture-item-detail-${item.fixtureKey}` : undefined
        }
        notice={<SaveStatusNotice item={detail} onMedia />}
        actions={<IntentsRow item={item} intents={intents} align="start" />}
        details={
          bodyPending ? (
            <View style={styles.bodyPending}>
              <StitchRing />
            </View>
          ) : (
            <ItemSheetBody
              item={item}
              detail={detail}
              spaces={spaces}
              similar={similar}
              paragraphs={paragraphs}
              social={social}
            />
          )
        }
      />
    );
  }

  const maxHeroHeight = height * 0.55;

  const letterboxed = letterboxedVideoRatio(item.url, item.aspectRatio);
  const heroAspect = pageHeroAspect(item, social, letterboxed);

  const frameInset = theme.gap(2) * 2 + theme.gap(1) * 2;
  const frameSize = (aspect: number) => {
    const frameHeight = Math.min((width - frameInset) / aspect, maxHeroHeight);
    return { width: frameHeight * aspect, height: frameHeight };
  };
  const { width: heroWidth, height: heroHeight } = frameSize(heroAspect);

  const heroKind = pageHeroKind(item, social);
  const poster = heroKind === "poster";

  const heroImage = heroUri ? (
    <Image
      source={{ uri: heroUri }}
      recyclingKey={item._id}
      {...pageHeroLook(
        heroKind,
        heroAspect,
        maxHeroHeight,
        { width: heroWidth, height: heroHeight },
        letterboxed !== undefined,
      )}
    />
  ) : null;

  const openPost = () => {
    openItemSource(item);
  };

  const opensAs = heroOpensAs(item, social);
  const hero =
    heroImage && opensAs && item.url ? (
      <PostMediaButton
        site={opensAs.site}
        playable={opensAs.playable}
        onPress={openPost}
      >
        {heroImage}
      </PostMediaButton>
    ) : (
      heroImage
    );

  const moreMedia =
    social && item.url && !poster
      ? (item.media ?? []).slice(1).map((media, index) => (
          <View key={index} style={[styles.heroContainer, styles.moreMedia]}>
            <PostMediaButton
              site={social.site}
              playable={media.kind !== "photo"}
              onPress={openPost}
            >
              <Image
                source={{ uri: media.imageUrl }}
                recyclingKey={`${item._id}-media-${index}`}
                contentFit="contain"
                style={[styles.heroImage, frameSize(media.aspectRatio)]}
              />
            </PostMediaButton>
          </View>
        ))
      : null;

  const zoomable = (target: ReactNode) =>
    isZoomTarget ? (
      <Link.AppleZoomTarget>{target}</Link.AppleZoomTarget>
    ) : (
      target
    );
  const sitePanel = !heroUri && showsSitePanel(item, social, bodyPending);

  const heroBlock = heroUri ? (
    <>
      <View style={heroKind === "framed" ? styles.heroContainer : undefined}>
        {zoomable(hero)}
      </View>
      {moreMedia}
    </>
  ) : sitePanel ? (
    zoomable(<SitePanel url={item.url} />)
  ) : null;

  const scrollProps = {
    ref: scrollRef,
    testID: item.fixtureKey
      ? `fixture-item-detail-${item.fixtureKey}`
      : undefined,
    contentInsetAdjustmentBehavior: "never" as const,
    style: [styles.container, { paddingTop: headerInset + theme.gap(5) }],
    contentContainerStyle: { paddingBottom: insets.bottom + theme.gap(4) },
    showsVerticalScrollIndicator: false,
    automaticallyAdjustKeyboardInsets: true,
    keyboardDismissMode: "interactive" as const,
    keyboardShouldPersistTaps: "handled" as const,
  };

  if (bodyPending) {
    return (
      <ScrollView {...scrollProps}>
        {heroBlock}
        <View style={styles.bodyPending}>
          <StitchRing />
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView {...scrollProps}>
      {heroBlock}

      <ItemPageBody
        item={item}
        detail={detail}
        spaces={spaces}
        similar={similar}
        paragraphs={paragraphs}
        social={social}
        intents={intents}
        hasHero={heroBlock !== null}
      />
    </ScrollView>
  );
});

const YOUTUBE: SocialPost = { site: "YouTube", playable: true };

function plainLink(item: DetailItem, social: SocialPost | undefined): boolean {
  return item.type === "link" && social === undefined;
}

function heroOpensAs(
  item: DetailItem,
  social: SocialPost | undefined,
): SocialPost | undefined {
  if (social) return social;
  return plainLink(item, social) && isYouTubeVideoUrl(item.url)
    ? YOUTUBE
    : undefined;
}

function showsSitePanel(
  item: DetailItem,
  social: SocialPost | undefined,
  bodyPending: boolean,
): boolean {
  if (bodyPending && item.enrichment === undefined) return false;
  return plainLink(item, social);
}

type PageHeroKind = "poster" | "sticker" | "framed";

function pageHeroKind(
  item: DetailItem,
  social: SocialPost | undefined,
): PageHeroKind {
  if (item.isSticker) return "sticker";
  return social ? "poster" : "framed";
}

function pageHeroAspect(
  item: DetailItem,
  social: SocialPost | undefined,
  letterboxed: number | undefined,
): number {
  // 1.91: OpenGraph images default to 1200×630.
  return (
    letterboxed ??
    item.aspectRatio ??
    (social?.playable ? 9 / 16 : item.type === "link" ? 1.91 : 1.4)
  );
}

function pageHeroLook(
  kind: PageHeroKind,
  aspect: number,
  maxHeight: number,
  framed: { width: number; height: number },
  letterboxed: boolean,
) {
  if (kind === "poster") {
    return { contentFit: "cover" as const, style: styles.poster };
  }
  return {
    contentFit: letterboxed ? ("cover" as const) : ("contain" as const),
    style:
      kind === "sticker"
        ? [styles.hero, { aspectRatio: aspect, maxHeight }]
        : [styles.heroImage, framed],
  };
}

type ItemIntent = NonNullable<DetailItem["intents"]>[number];

function MoreMedia({ item, site }: { item: DetailItem; site: string }) {
  const { theme } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const rest = (item.media ?? []).slice(1);
  if (rest.length === 0) return null;
  const inset = theme.gap(2) * 2 + theme.gap(1) * 2;
  return (
    <View style={styles.moreMediaList}>
      {rest.map((media, index) => (
        <View key={index} style={styles.heroContainer}>
          <PostMediaButton
            site={site}
            playable={media.kind !== "photo"}
            onPress={() => openItemSource(item)}
          >
            <Image
              source={{ uri: media.imageUrl }}
              recyclingKey={`${item._id}-media-${index}`}
              contentFit="contain"
              style={[
                styles.heroImage,
                fitMedia(media.aspectRatio, width - inset, height * 0.55),
              ]}
            />
          </PostMediaButton>
        </View>
      ))}
    </View>
  );
}

type DetailBodyProps = {
  item: DetailItem;
  detail: ReturnType<typeof useItemDetailData>["detail"];
  spaces: ReturnType<typeof useItemDetailData>["spaces"];
  similar: ReturnType<typeof useItemDetailData>["similar"];
  paragraphs: string[];
  social: SocialPost | undefined;
};

function ItemPageBody({
  item,
  detail,
  spaces,
  similar,
  paragraphs,
  social,
  intents,
  hasHero,
}: DetailBodyProps & {
  intents: ItemIntent[];
  hasHero: boolean;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  if (item.type === "note") {
    return (
      <View style={styles.body}>
        <NoteEditor key={item._id} item={detail} />
        {item.status === "ready" ? (
          <ItemSpaces itemId={item._id} spaces={spaces} />
        ) : null}
        <SaveStatusNotice item={detail} />
      </View>
    );
  }

  return (
    <View style={[styles.body, hasHero ? { paddingTop: theme.gap(5) } : null]}>
      <SaveStatusNotice item={item} centered />

      {item.status === "ready" ? (
        <ItemSpaces itemId={item._id} spaces={spaces} centered />
      ) : null}

      {item.url && plainLink(item, social) ? (
        <View style={styles.siteActions}>
          <SiteButton item={item} />
          <IntentsRow item={item} intents={intents} />
        </View>
      ) : (
        <>
          {item.url ? (
            <View style={styles.titleContainer}>
              <ItemSourceLink
                item={item}
                icon={social?.playable ? "play.rectangle" : "safari"}
                iconSize={15}
                arrowSize={11}
                iconTintColor={theme.colors.muted}
                arrowTintColor={theme.colors.faint}
                label={
                  social && item.author
                    ? `${item.author} · ${social.site}`
                    : undefined
                }
                style={styles.sourceRow}
                textStyle={styles.sourceText}
              />
            </View>
          ) : null}

          <IntentsRow item={item} intents={intents} />
        </>
      )}

      {item.description && !(social && detail.recipe) ? (
        <Text style={styles.description}>{item.description}</Text>
      ) : null}

      {item.url && !detail.content && !plainLink(item, social) ? (
        <Pressable
          style={styles.urlRow}
          accessibilityRole="link"
          onPress={() => {
            openItemSource(item);
          }}
          hitSlop={{ top: 12, bottom: 12, left: 8, right: 8 }}
        >
          <AppSymbolIcon name="link" size={11} tintColor={theme.colors.faint} />
          <Text style={styles.urlText} numberOfLines={2}>
            {item.url}
          </Text>
        </Pressable>
      ) : null}

      <DetailSections
        item={item}
        detail={detail}
        similar={similar}
        paragraphs={paragraphs}
        social={social}
      />
    </View>
  );
}

function ItemSheetBody({
  item,
  detail,
  spaces,
  similar,
  paragraphs,
  social,
}: DetailBodyProps) {
  useAppLocale();
  return (
    <View style={styles.body}>
      {item.status === "ready" ? (
        <ItemSpaces itemId={item._id} spaces={spaces} />
      ) : null}

      {social && item.url ? <MoreMedia item={item} site={social.site} /> : null}

      {item.description ? (
        <Text style={styles.description}>{item.description}</Text>
      ) : null}

      <DetailSections
        item={item}
        detail={detail}
        similar={similar}
        paragraphs={paragraphs}
        social={social}
      />
    </View>
  );
}

function DetailSections({
  item,
  detail,
  similar,
  paragraphs,
  social,
}: Omit<DetailBodyProps, "spaces">) {
  const { theme } = useUnistyles();
  const recipe = detail.recipe ? (
    <RecipeSection key={item._id} recipe={detail.recipe} />
  ) : null;
  const recipeFirst = social !== undefined && recipe !== null;
  return (
    <>
      {recipeFirst ? recipe : null}

      {social && !recipeFirst && paragraphs.length > 0 ? (
        <Text selectable style={styles.paragraph}>
          {paragraphs.join("\n\n")}
        </Text>
      ) : null}

      <TagsRow tags={item.tags} />

      {item.status === "ready" ? (
        <ProductsSection item={detail} inset={theme.gap(2)} />
      ) : null}

      {recipeFirst ? null : recipe ? (
        recipe
      ) : !social && paragraphs.length > 0 ? (
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
          <Text style={styles.similarTitle}>{t("item.similar")}</Text>
          <SimilarGrid items={similar} />
        </View>
      ) : null}
    </>
  );
}

function IntentsRow({
  item,
  intents,
  align = "center",
}: {
  item: DetailItem;
  intents: ItemIntent[];
  align?: "center" | "start";
}) {
  if (intents.length === 0) return null;
  return (
    <View
      style={[
        styles.intentsRow,
        align === "start" && { justifyContent: "flex-start" },
      ]}
    >
      {intents.map((intent, index) => (
        <IntentChip
          key={`${intent.kind}-${index}`}
          kind={intent.kind}
          label={intent.label}
          onPress={() => {
            void runIntent(intent.kind, intent.value)
              .then(() => {
                analytics.itemAction(
                  item,
                  intent.kind === "open_url"
                    ? "open_source"
                    : intent.kind === "add_event"
                      ? "calendar_sheet_opened"
                      : intent.kind,
                );
              })
              .catch(() => {});
          }}
        />
      ))}
    </View>
  );
}

function TagsRow({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <View style={styles.chipsRow}>
      {tags.map((tag) => (
        <TagChip key={tag} label={tag} />
      ))}
    </View>
  );
}

type SaveState = "image_too_large" | "gone" | "failed" | "stalled" | "partial";

function saveState(item: DetailItem, now: number): SaveState | null {
  if (item.status === "failed") {
    if (item.failureReason === "image_too_large") return "image_too_large";
    return item.failureReason === "not_found" ? "gone" : "failed";
  }
  if (isStaleProcessing(item, now)) {
    return "stalled";
  }
  if (item.status !== "ready") {
    return null;
  }
  return item.enrichment === "partial" ? "partial" : null;
}

const SAVE_STATE_NOTICE: Record<SaveState, TextMessageKey> = {
  image_too_large: "errors.photoTooLarge",
  gone: "item.pageGone",
  failed: "item.pageFailed",
  stalled: "item.stalled",
  partial: "item.partial",
};

function noticeFor(state: SaveState, type: DetailItem["type"]): string {
  if (state === "gone" && type === "image") {
    return t("errors.photoUnavailable");
  }
  if (state === "failed" && type !== "link") {
    return type === "image" ? t("item.photoFailed") : t("item.noteFailed");
  }
  return t(SAVE_STATE_NOTICE[state]);
}

function SaveStatusNotice({
  item,
  centered = false,
  onMedia = false,
}: {
  item: DetailItem;
  centered?: boolean;
  onMedia?: boolean;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const reprocess = useMutation(api.items.reprocessItem);
  const { guard, loading: entitlementLoading } = usePaywallGuard("item_detail");
  const [retrying, setRetrying] = useState(false);
  // The React Compiler flags impure calls such as Date.now() in the render body.
  const [now, setNow] = useState(() => Date.now());
  const processing = item.status === "processing";
  useEffect(() => {
    if (!processing) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [processing]);

  const state = saveState(item, now);

  if (processing && state === null) {
    return (
      <View style={[styles.processingRow, centered && styles.centeredRow]}>
        <StitchRing color={onMedia ? "white" : undefined} />
        <Text style={[styles.processingText, onMedia && styles.onMediaText]}>
          {t("item.reading")}
        </Text>
      </View>
    );
  }

  if (state === null) {
    return null;
  }

  return (
    <View style={[styles.noticeRow, centered && styles.centeredRow]}>
      <AppSymbolIcon
        name="exclamationmark.triangle.fill"
        size={14}
        tintColor={state === "gone" ? theme.colors.faint : theme.colors.danger}
      />
      <Text
        style={[
          styles.noticeText,
          centered && styles.centeredText,
          onMedia && styles.onMediaText,
        ]}
      >
        {noticeFor(state, item.type)}
      </Text>
      {isTerminalFailure(item.failureReason) ? null : (
        <Pressable
          accessibilityRole="button"
          style={({ pressed }) => [styles.chip, pressed && { opacity: 0.7 }]}
          onPress={async () => {
            setRetrying(true);
            try {
              const scheduled = await reprocess({ id: item._id });
              if (!scheduled) {
                Alert.alert(t("item.stillWorking"), t("item.retryLater"));
              }
            } catch (error) {
              const paywalled =
                saveErrorCode(error) === "pro_required" && !(await guard());
              if (!paywalled)
                Alert.alert(t("errors.retryTitle"), t("errors.retrySoon"));
            } finally {
              setRetrying(false);
            }
          }}
          disabled={retrying || entitlementLoading}
          hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
        >
          {retrying ? (
            <StitchRing size={14} color={theme.colors.primaryText} />
          ) : (
            <AppSymbolIcon
              name="arrow.clockwise"
              size={12}
              tintColor={theme.colors.primaryText}
            />
          )}
          <Text style={styles.chipLabel}>{t("common.tryAgain")}</Text>
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
    width: "100%",
  },
  heroContainer: {
    backgroundColor: theme.colors.frame,
    alignSelf: "center",
    marginHorizontal: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    padding: theme.gap(1),
    boxShadow: `0 0 4px 0 ${theme.colors.imageBorder}`,
  },
  moreMedia: {
    marginTop: theme.gap(2),
  },
  moreMediaList: {
    gap: theme.gap(2),
    marginHorizontal: -theme.gap(2),
  },
  poster: {
    width: "100%",
    height: 250,
    backgroundColor: theme.colors.surfaceMuted,
  },
  heroImage: {
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  body: {
    gap: theme.gap(5),
    paddingHorizontal: theme.gap(2),
  },
  bodyPending: {
    paddingTop: theme.gap(5),
    alignItems: "center",
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  onMediaText: {
    color: "rgba(255, 255, 255, 0.86)",
  },
  processingText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  noticeRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: theme.gap(1),
  },
  noticeText: {
    flexShrink: 1,
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  centeredRow: {
    justifyContent: "center",
  },
  centeredText: {
    textAlign: "center",
  },
  siteActions: {
    gap: theme.gap(1.5),
  },
  titleContainer: {
    gap: theme.gap(1),
    alignItems: "center",
    justifyContent: "center",
  },
  sourceRow: {
    flexDirection: "row",
    alignItems: "center",
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
    textAlign: "center",
    color: theme.colors.muted,
  },
  urlRow: {
    maxWidth: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    alignSelf: "center",
    paddingHorizontal: theme.gap(1),
  },
  urlText: {
    flexShrink: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.faint,
  },
  chipsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(0.75),
    justifyContent: "center",
  },
  intentsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.gap(1),
    justifyContent: "center",
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
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: theme.colors.primarySoft,
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 50,
  },
  chipLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
}));
