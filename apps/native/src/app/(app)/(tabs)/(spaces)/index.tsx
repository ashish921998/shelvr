import { ActionMenu } from '@/components/ui/action-menu';
import { EmptyState } from '@/components/empty-state';
import { SuggestedBadge } from '@/components/suggested-badge';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { convexQuery } from '@convex-dev/react-query';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';
import { Image } from 'expo-image';
import { Link } from 'expo-router';
import { AppSymbolIcon } from '@/components/symbol';
import { ProgressiveBlurHeader } from 'progressive-blur';
import { ScreenLoader } from '@/components/ui/screen-loader';
import { Alert, Platform, Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// Standard OpenGraph image shape (1200×630) — the default when a link's real
// hero dimensions weren't captured. Mirrors item-card so covers match the feed.
const OG_RATIO = 1.91;

function clampRatio(ratio: number | undefined, fallback: number) {
  const value = ratio && !Number.isNaN(ratio) ? ratio : fallback;
  // Respect the cover's real proportions; only bound pathological panoramas /
  // slivers so the stack keeps a sane footprint inside its square cell.
  return Math.min(Math.max(value, 0.6), 1.9);
}

// Stable pseudo-random in [-1, 1) derived from a seed string (FNV-1a), so each
// card's jitter is fixed per space and doesn't reshuffle on every re-render.
function seededUnit(seed: string) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) / 0xffffffff) * 2 - 1;
}

// The cover fills this fraction of the stack area on each axis. The stack area
// itself already carries the cover's aspect ratio, so the same fraction on both
// axes keeps every card at that ratio; the leftover margin lets the tilted cards
// behind peek out and keeps rotated corners from clipping the cell edge.
const COVER_SCALE = 0.82;

// Centering + size for a card that fills COVER_SCALE of the stack area. The free
// space on each axis is (1 - scale); half of it is the offset that centers it.
const CARD_POSITION = {
  position: 'absolute' as const,
  left: `${((1 - COVER_SCALE) / 2) * 100}%` as const,
  top: `${((1 - COVER_SCALE) / 2) * 100}%` as const,
  width: `${COVER_SCALE * 100}%` as const,
  height: `${COVER_SCALE * 100}%` as const,
};

// The two cards behind the cover: a base tilt + shove, jittered per space so no
// two piles land the same. The cover (drawn last) sits nearly upright on top.
const BACKS = [
  { rot: -4.5, tx: -6, ty: 5 },
  { rot: 4, tx: 7, ty: -3 },
];

// A hand-dropped pile of three same-size cards: two tilted blanks behind and the
// real cover, barely rotated, on top. The pile's box takes the cover's aspect
// ratio so the masonry feed packs spaces at their true proportions, exactly like
// the home cards. An empty space shows a designed starter cover.
function CoverStack({
  cover,
  seed,
  name,
}: {
  cover:
    | { url: string; type: string; aspectRatio?: number; suggested?: boolean }
    | undefined;
  seed: string;
  name: string;
}) {
  const { theme } = useUnistyles();
  const ratio = cover
    ? clampRatio(cover.aspectRatio, cover.type === 'link' ? OG_RATIO : 1)
    : 1;
  const position = CARD_POSITION;

  return (
    <View style={[styles.stack, { aspectRatio: ratio }]}>
      {BACKS.map((back, i) => (
        <View
          key={i}
          style={[
            styles.card,
            styles.cardBlank,
            !cover && styles.cardEmptyBack,
            position,
            {
              transform: [
                { translateX: back.tx },
                { translateY: back.ty },
                { rotate: `${back.rot + seededUnit(`${seed}-b${i}`) * 1.5}deg` },
              ],
            },
          ]}
        />
      ))}
      {cover ? (
        <View
          style={[
            styles.card,
            styles.coverFrame,
            position,
            { transform: [{ rotate: `${seededUnit(`${seed}-top`) * 2}deg` }] },
          ]}
        >
          <Image source={{ uri: cover.url }} style={styles.coverImage} contentFit="cover" />
          {/* A pile fronted by a not-yet-accepted pick wears the sparkle. */}
          {cover.suggested ? (
            <View style={styles.coverBadge}>
              <SuggestedBadge size={22} />
            </View>
          ) : null}
        </View>
      ) : (
        <View
          style={[
            styles.card,
            styles.cardEmpty,
            position,
            { transform: [{ rotate: `${seededUnit(`${seed}-top`) * 2}deg` }] },
          ]}
        >
          <View style={styles.emptyIconWell}>
            <AppSymbolIcon
              name={emptySpaceIcon(name)}
              size={26}
              weight="semibold"
              tintColor={theme.colors.primaryText}
            />
          </View>
          <Text style={styles.emptyLabel}>Add first save</Text>
        </View>
      )}
    </View>
  );
}

function emptySpaceIcon(name: string) {
  // Best-effort English heuristic; names outside these hints use the generic stack.
  const normalized = name.toLowerCase();
  if (normalized.includes('wish') || normalized.includes('gift')) return 'heart';
  if (normalized.includes('video') || normalized.includes('watch')) return 'play.rectangle';
  if (normalized.includes('read') || normalized.includes('article')) return 'doc.text';
  if (normalized.includes('inspiration') || normalized.includes('idea')) return 'sparkles';
  return 'rectangle.stack';
}

export default function SpacesScreen() {
  const { theme } = useUnistyles();
  const { data: spaces } = useQuery(convexQuery(api.spaces.listSpaces, {}));
  const deleteSpace = useMutation(api.spaces.deleteSpace);

  const confirmDelete = (id: Id<'spaces'>) => {
    Alert.alert('Delete space?', 'Your saves stay in Home — only the shelf goes away.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteSpace({ id }) },
    ]);
  };

  if (spaces === undefined) {
    return (
      <ScreenLoader label="Opening your spaces" />
    );
  }

  if (spaces.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title="Make a space"
          message={'Spaces are shelves for a theme — design inspiration,\nrecipes, gift ideas. Shelvr suggests saves that fit;\nyou choose what sticks.'}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlashList
        data={spaces}
        masonry
        numColumns={2}
        optimizeItemArrangement
        keyExtractor={(space) => space._id}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        renderItem={({ item: space, index }) => {
          // `previews` can be briefly absent when the offline cache rehydrates an
          // older query shape before the live refetch lands. The newest item is
          // the cover; the rest of the pile is intentionally blank.
          const cover = (space.previews ?? [])[0];
          return (
            <Animated.View
              style={styles.cell}
              entering={FadeInDown.delay(index * 60).duration(350)}
            >
              <Link href={`/space/${space._id}`} asChild>
                <Link.Trigger withAppleZoom>
                  {/* The whole card is the pressable that routes to the space. */}
                  <Pressable style={({ pressed }) => pressed && styles.pressed}>
                    <CoverStack cover={cover} seed={space._id} name={space.name} />
                    <View style={styles.caption}>
                      <Text style={styles.title} numberOfLines={1}>
                        {space.name}
                      </Text>
                      <ActionMenu
                        label="Space actions"
                        title="Space actions"
                        actions={[
                          {
                            label: 'Delete',
                            destructive: true,
                            onPress: () => confirmDelete(space._id),
                          },
                        ]}
                        style={styles.menuButton}
                      >
                        <AppSymbolIcon name="ellipsis" size={15} tintColor={theme.colors.foreground} />
                      </ActionMenu>
                    </View>
                  </Pressable>
                </Link.Trigger>
                <Link.Preview />
                <Link.Menu>
                  <Link.MenuAction
                    title="Delete"
                    icon="trash"
                    destructive
                    onPress={() => confirmDelete(space._id)}
                  />
                </Link.Menu>
              </Link>
            </Animated.View>
          );
        }}
      />
      {Platform.OS === 'ios' ? <ProgressiveBlurHeader /> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  content: {
    padding: theme.gap(1),
  },
  // Grid cell — no panel of its own (like the home feed); the stacked covers are
  // the visual. The margin creates the gutters between the two columns and rows.
  cell: {
    flex: 1,
    margin: theme.gap(1),
  },
  pressed: {
    opacity: 0.85,
  },
  // Square area the pile is centered within. Kept square so every cell is the
  // same height and the 2-column grid stays tidy regardless of cover shape.
  stack: {
    width: '100%',
    aspectRatio: 1,
  },
  // Shared frame for all three cards: same radius/shadow so the pile reads as
  // one photo restacked. width/height/position/transform come from CoverStack.
  card: {
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    boxShadow: `0 6px 14px rgba(0,0,0,0.22), inset 0 0 0 1px ${theme.colors.imageBorder}`,
  },
  // The cover: a white matte with a little padding around the photo, matching the
  // home feed's item frame so a save looks the same fanned into a space.
  coverFrame: {
    backgroundColor: '#ffffff',
    padding: theme.gap(0.5),
    zIndex: 3,
  },
  coverBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  coverImage: {
    flex: 1,
    borderRadius: theme.radius.sm,
    borderCurve: 'continuous',
    // White (not surfaceMuted) so a transparent die-cut sticker cover shows white
    // behind it, matching the matte instead of a grey block.
    backgroundColor: '#ffffff',
  },
  // The blank cards behind — same white stock as the cover matte so the pile
  // reads as a stack of identical cards.
  cardBlank: {
    backgroundColor: '#ffffff',
    zIndex: 1,
  },
  cardEmptyBack: {
    backgroundColor: theme.colors.surfaceMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  // A new space gets an intentional cover until its first saved item becomes
  // the thumbnail. Avoid a blank white card, which reads as a loading failure.
  cardEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.gap(1),
    backgroundColor: theme.colors.primarySoft,
    borderWidth: 1,
    borderColor: theme.colors.border,
    zIndex: 3,
  },
  emptyIconWell: {
    width: 50,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: theme.colors.surface,
  },
  emptyLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 11,
    color: theme.colors.primaryText,
  },
  // Name + ellipsis row below the pile, mirroring the home feed's caption.
  caption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(0.5),
    paddingHorizontal: theme.gap(0.5),
    paddingTop: theme.gap(1),
  },
  title: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 10,
    lineHeight: 12,
    color: theme.colors.foreground,
  },
  menuButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
}));
