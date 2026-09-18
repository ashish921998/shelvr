import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { EmptyState } from "@/components/empty-state";
import { InkIcon } from "@/components/ink/ink-icon";
import { StitchLine } from "@/components/ink/stitch-line";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { ShelfRow, type ShelfCard } from "@/components/shelf/shelf-row";
import { ShelfToast } from "@/components/shelf/shelf-toast";
import { Eyebrow, Gutter } from "@/components/shelf/typography";
import { StandingCard } from "@/components/shelf/standing-card";
import {
  HeaderActionMenu,
  HeaderIconButton,
} from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { SuggestedBadge } from "@/components/suggested-badge";
import { saveMark } from "@/lib/ink/save-mark";
import { useInkClock } from "@/lib/ink/use-ink-clock";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export default function SpaceScreen() {
  useAppLocale();
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { theme } = useUnistyles();
  const { width } = useWindowDimensions();
  const clock = useInkClock();

  const { data: space } = useQuery(
    convexQuery(api.spaces.getSpace, { id: id as Id<"spaces"> }),
  );
  const deleteSpace = useMutation(api.spaces.deleteSpace);
  const acceptAllSuggestions = useMutation(api.spaces.acceptAllSuggestions);
  const acceptSuggestion = useMutation(api.spaces.acceptSuggestion);

  // Suggestions hover: they have not landed on the shelf, so the row is closed
  // until asked for and nothing is drawn under the cards it reveals.
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [shelved, setShelved] = useState<string | null>(null);

  if (space === undefined) {
    return <ScreenLoader label={t("loading.space")} />;
  }

  if (space === null) {
    return (
      <View style={styles.container}>
        <EmptyState
          title={t("item.goneTitle")}
          message={t("spaces.gone")}
          prop={null}
        />
      </View>
    );
  }

  const confirmDelete = () => {
    Alert.alert(t("spaces.deleteTitle"), t("spaces.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: async () => {
          router.back();
          await deleteSpace({ id: space._id });
          analytics.capture("space_deleted");
        },
      },
    ]);
  };

  const confirm = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    setShelved(space.name);
  };

  const addAll = () => {
    confirm();
    acceptAllSuggestions({ spaceId: space._id })
      .then((count) => {
        if (count > 0) {
          analytics.capture("space_suggestions_accepted", {
            suggestion_count: count,
          });
        }
      })
      .catch(() => undefined);
  };

  const addOne = (itemId: Id<"items">) => {
    confirm();
    acceptSuggestion({ spaceId: space._id, itemId })
      .then(() =>
        analytics.capture("space_suggestions_accepted", {
          suggestion_count: 1,
        }),
      )
      .catch(() => undefined);
  };

  const suggestions = space.suggestions;
  const items = space.items;

  return (
    <View
      style={styles.container}
      testID={
        space.fixtureKey
          ? `fixture-space-detail-${space.fixtureKey}`
          : undefined
      }
    >
      <ScreenHeader
        clock={clock}
        title={space.name}
        subtitle={t("spaces.saveCount", { count: items.length })}
        left={
          <HeaderIconButton
            icon="chevron.left"
            label={t("common.back")}
            onPress={() => router.back()}
          />
        }
        // The plus is gone: everything that is not "read this shelf" lives in
        // the menu, so the header carries the name and one button.
        right={
          <HeaderActionMenu
            icon="ellipsis"
            label={t("spaces.actions")}
            title={space.name}
            actions={[
              {
                label: t("spaces.addItem"),
                onPress: () =>
                  router.push({ pathname: "/add", params: { spaceId: id } }),
              },
              {
                label: t("spaces.editTitle"),
                onPress: () =>
                  router.push({ pathname: "/new-space", params: { id } }),
              },
              {
                label: t("spaces.delete"),
                destructive: true,
                onPress: confirmDelete,
              },
            ]}
          />
        }
      />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {suggestions.length > 0 ? (
          <View style={styles.suggested}>
            <Pressable
              style={styles.suggestedHeader}
              onPress={() => setSuggestionsOpen((open) => !open)}
              accessibilityRole="button"
              accessibilityState={{ expanded: suggestionsOpen }}
              accessibilityLabel={t("spaces.suggestionCount", {
                count: suggestions.length,
              })}
              testID="suggested-row"
            >
              <SuggestedBadge size={20} />
              <Text style={styles.suggestedLabel}>
                {t("spaces.suggestionCount", { count: suggestions.length })}
              </Text>
              <InkIcon
                name={suggestionsOpen ? "chevron.down" : "chevron.right"}
                size={14}
                tint={theme.colors.faint}
              />
              <View style={styles.spacer} />
              <Pressable
                onPress={addAll}
                accessibilityRole="button"
                hitSlop={8}
              >
                <Text style={styles.addAll}>{t("spaces.addAll")}</Text>
              </Pressable>
            </Pressable>

            {suggestionsOpen ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hovering}
              >
                {suggestions.map((item, index) => (
                  <View key={item._id} style={styles.hoveringCard}>
                    <StandingCard
                      imageUrl={item.imageUrl ?? item.heroImageUrl}
                      title={item.title ?? item.note}
                      note={item.type === "note"}
                      mark={saveMark(item)}
                      aspectRatio={item.aspectRatio}
                      index={index}
                      clock={clock}
                      accessibilityLabel={item.title ?? item.note}
                      onPress={() =>
                        router.push({
                          pathname: "/item/[id]",
                          params: { id: item._id, from: "space", spaceId: id },
                        })
                      }
                    />
                    {/* The sparkle says "suggested"; adding one needs its own
                        button, so each card carries an ink + disc. */}
                    <Pressable
                      style={styles.addDisc}
                      onPress={() => addOne(item._id)}
                      accessibilityRole="button"
                      accessibilityLabel={t("spaces.addItem")}
                      hitSlop={6}
                    >
                      <InkIcon
                        name="plus"
                        size={14}
                        tint={theme.colors.ink.light}
                      />
                    </Pressable>
                  </View>
                ))}
              </ScrollView>
            ) : null}

            <StitchLine width={width} clock={clock} />
          </View>
        ) : null}

        {items.length === 0 ? (
          <EmptyState
            title={t("spaces.listEmptyTitle")}
            message={t("spaces.listEmptyBody")}
          />
        ) : (
          <View style={styles.shelf}>
            <Gutter>
              <Eyebrow>{`${t("spaces.onTheShelf")} · ${items.length}`}</Eyebrow>
            </Gutter>
            <ShelfRow
              width={width}
              clock={clock}
              prop="books"
              testID="shelf-items"
              cards={items.map<ShelfCard>((item) => ({
                key: item._id,
                imageUrl: item.imageUrl ?? item.heroImageUrl,
                title: item.title ?? item.note,
                note: item.type === "note",
                mark: saveMark(item),
                aspectRatio: item.aspectRatio,
                accessibilityLabel: item.title ?? item.note,
                onPress: () =>
                  router.push({
                    pathname: "/item/[id]",
                    params: { id: item._id, from: "space", spaceId: id },
                  }),
              }))}
            />
          </View>
        )}
      </ScrollView>

      <ShelfToast
        verdict={t("spaces.shelved")}
        detail={shelved ? t("spaces.ontoShelf", { space: shelved }) : undefined}
        visible={shelved !== null}
        onHidden={() => setShelved(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingTop: 16, paddingBottom: 40 },
  suggested: { marginBottom: 20, gap: 8 },
  suggestedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 36,
    paddingHorizontal: 20,
  },
  suggestedLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: theme.colors.primaryText,
  },
  spacer: { flex: 1 },
  addAll: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  // Suggested cards hover with a floating shadow and no board beneath them.
  hovering: {
    flexDirection: "row",
    gap: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  hoveringCard: { position: "relative" },
  addDisc: {
    position: "absolute",
    right: -10,
    top: -10,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.foreground,
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  shelf: { gap: 8 },
}));
