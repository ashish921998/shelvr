import { ItemCard, type FeedItem } from '@/components/item-card';
import { Icon } from '@/components/symbol';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { useMutation } from 'convex/react';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

// Step 6 — the gotcha. "Paste any link — watch Shelvr file it." This is the real
// processItem pipeline: createLinkItem inserts a row, getItem subscribes, and
// the reveal (title/tags/space) appears as status flips processing → ready. The
// same ItemCard the home feed uses renders the result, so nothing is faked.

// Curated sample links — each is a real, classifiable page that exercises the
// pipeline end to end (fetch → readability → tag → file). Kept generic so they
// work regardless of which spaces the user just created.
const SAMPLE_LINKS: { label: string; url: string }[] = [
  { label: 'A recipe', url: 'https://www.bbcgoodfood.com/recipes/classic-lasagne' },
  { label: 'A long read', url: 'https://www.paulgraham.com/ds.html' },
  { label: 'A product', url: 'https://www.apple.com/airpods-pro/' },
];

const TIMEOUT_MS = 15_000;

export function LiveDemoStep({
  onReady,
  onAdvance,
}: {
  onReady: (item: FeedItem) => void;
  onAdvance: () => void;
}) {
  const { theme } = useUnistyles();
  const createLinkItem = useMutation(api.items.createLinkItem);
  const [url, setUrl] = useState('');
  const [itemId, setItemId] = useState<Id<'items'> | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const advancedRef = useRef(false);

  // Subscribe to the item once we have an id — re-renders as the AI pipeline
  // fills in title/tags/spaces and flips status to ready.
  const { data: item } = useQuery({
    ...convexQuery(api.items.getItem, { id: itemId! }),
    enabled: itemId !== null,
  });

  // Lift the classified item up to the orchestrator exactly once, so the recap
  // (ready step) can render the same card the user just watched get filed. Runs
  // only on the processing → ready transition.
  const liftedRef = useRef(false);
  useEffect(() => {
    if (item && item.status === 'ready' && !liftedRef.current) {
      liftedRef.current = true;
      onReady({
        _id: item._id,
        type: item.type,
        status: item.status,
        title: item.title,
        url: item.url,
        siteName: item.siteName,
        heroImageUrl: item.heroImageUrl,
        imageUrl: item.imageUrl,
        aspectRatio: item.aspectRatio,
        tags: item.tags,
      });
    }
  }, [item, onReady]);

  const advance = () => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    onAdvance();
  };

  // 15s safety net: if the pipeline hasn't gone ready, show a friendly "still
  // working" message and advance. Never strand the user on a hung classification.
  useEffect(() => {
    if (itemId === null) return;
    const id = setTimeout(() => {
      if (item?.status !== 'ready') advance();
    }, TIMEOUT_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const submit = async (rawUrl: string) => {
    const trimmed = rawUrl.trim();
    if (trimmed === '' || submitting) return;
    setSubmitting(true);
    setError(null);
    setUrl(trimmed);
    try {
      const id = await createLinkItem({ url: trimmed });
      setItemId(id);
    } catch {
      setError('Could not save that link. Try another, or skip.');
      setSubmitting(false);
    }
  };

  const paste = async () => {
    const clipped = await Clipboard.getStringAsync();
    if (clipped.trim() !== '') setUrl(clipped.trim());
  };

  // ---- Reveal state: item is ready, show the classified card ----
  if (item && item.status === 'ready') {
    const feedItem: FeedItem = {
      _id: item._id,
      type: item.type,
      status: item.status,
      title: item.title,
      url: item.url,
      siteName: item.siteName,
      heroImageUrl: item.heroImageUrl,
      imageUrl: item.imageUrl,
      aspectRatio: item.aspectRatio,
      tags: item.tags,
    };
    return (
      <View style={styles.wrap}>
        <Animated.Text entering={FadeInDown.duration(400)} style={styles.headline}>
          Filed.
        </Animated.Text>
        <Animated.Text entering={FadeInDown.delay(60).duration(400)} style={styles.support}>
          That&apos;s Shelvr. Every save gets a title, tags, and a home.
        </Animated.Text>

        <Animated.View entering={FadeIn.duration(300)} style={styles.reveal}>
          <ItemCard item={feedItem} />
        </Animated.View>

        <View style={styles.footer}>
          <Pressable style={styles.skipRow} onPress={advance}>
            <Text style={styles.continueText}>Continue</Text>
            <Icon name="chevron.right" size={14} tintColor={theme.colors.primary} />
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Processing state: shimmer while the pipeline runs ----
  if (itemId !== null) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.headline}>Watch Shelvr file a save.</Text>
        <Text style={styles.support}>Reading the page, pulling a title, picking tags…</Text>

        <View style={styles.processingCard}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.processingLine}>Classifying your save…</Text>
        </View>

        <View style={styles.footer}>
          <Pressable onPress={advance}>
            <Text style={styles.skipText}>Still working — it&apos;ll be on your shelf</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ---- Input state: paste field + sample links ----
  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>Watch Shelvr file a save.</Text>
      <Text style={styles.support}>Paste a link, or try one of ours.</Text>

      <View style={styles.inputRow}>
        <TextInput
          value={url}
          onChangeText={setUrl}
          placeholder="Paste a URL"
          placeholderTextColor={theme.colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          onSubmitEditing={() => submit(url)}
        />
        <Pressable onPress={paste} style={styles.pasteBtn}>
          <Text style={styles.pasteText}>Paste</Text>
        </Pressable>
      </View>

      {error !== null && <Text style={styles.error}>{error}</Text>}

      <View style={styles.samples}>
        <Text style={styles.samplesLabel}>Try one:</Text>
        <View style={styles.sampleRow}>
          {SAMPLE_LINKS.map((s) => (
            <Pressable
              key={s.url}
              onPress={() => submit(s.url)}
              disabled={submitting}
              style={({ pressed }) => [styles.sampleChip, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.sampleLabel}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.footer}>
        {url.trim() !== '' && !submitting && (
          <Pressable
            onPress={() => submit(url)}
            style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.submitText}>Save it</Text>
          </Pressable>
        )}
        <Pressable onPress={advance}>
          <Text style={styles.skipText}>Skip for now</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
  },
  inputRow: {
    flexDirection: 'row',
    gap: theme.gap(1),
  },
  input: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    paddingHorizontal: theme.gap(1.5),
    paddingVertical: theme.gap(1.5),
  },
  pasteBtn: {
    justifyContent: 'center',
    paddingHorizontal: theme.gap(1.5),
  },
  pasteText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.primary,
  },
  error: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.danger,
  },
  samples: {
    gap: theme.gap(1),
  },
  samplesLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
  sampleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.gap(1),
  },
  sampleChip: {
    paddingVertical: theme.gap(1),
    paddingHorizontal: theme.gap(1.75),
    borderRadius: 50,
    backgroundColor: theme.colors.primarySoft,
  },
  sampleLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.primaryText,
  },
  processingCard: {
    alignItems: 'center',
    gap: theme.gap(2),
    paddingVertical: theme.gap(5),
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderCurve: 'continuous',
  },
  processingLine: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
  reveal: {
    // ItemCard carries its own padding; let it sit on the surface.
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: theme.gap(1.5),
  },
  submitBtn: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: 'continuous',
    paddingVertical: theme.gap(1.75),
    paddingHorizontal: theme.gap(4),
    alignItems: 'center',
  },
  submitText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: '#fff',
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  continueText: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    color: theme.colors.primary,
  },
  skipText: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.muted,
  },
}));
