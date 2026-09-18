import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { ActionMenu } from "@/components/ui/action-menu";
import { EmptyState } from "@/components/empty-state";
import { InkIcon } from "@/components/ink/ink-icon";
import { InkShelf } from "@/components/ink/ink-shelf";
import { InkUprights } from "@/components/ink/ink-uprights";
import { TypeMark } from "@/components/ink/type-mark";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { ShelfThumbnail } from "@/components/shelf/shelf-thumbnail";
import { Eyebrow } from "@/components/shelf/typography";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { cardTilt } from "@/lib/shelf-layout";
import { saveMark } from "@/lib/ink/save-mark";
import { useInkClock } from "@/lib/ink/use-ink-clock";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { Link, useRouter } from "expo-router";
import {
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** How many saves stand on a shelf row before the rest are left off. */
const THUMBS_PER_ROW = 4;

type SpaceRow = {
  _id: Id<"spaces">;
  name: string;
  itemCount: number;
  suggestionCount: number;
  fixtureKey?: string;
  previews?: {
    url: string;
    type: "image" | "link" | "note";
    suggested: boolean;
  }[];
};

/** The mark beside a shelf's name: what the shelf holds. The name is the best
 * signal available — "Recipes" earns the recipe mark — with the first save's
 * own kind behind it. */
function shelfMark(space: SpaceRow) {
  const lead = space.previews?.[0];
  return saveMark({ type: lead?.type ?? "link", tags: [space.name] });
}

export default function SpacesScreen() {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const clock = useInkClock();
  const { data: spaces } = useQuery(convexQuery(api.spaces.listSpaces, {}));
  const deleteSpace = useMutation(api.spaces.deleteSpace);

  const confirmDelete = (id: Id<"spaces">) => {
    Alert.alert(t("spaces.deleteTitle"), t("spaces.deleteBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("common.delete"),
        style: "destructive",
        onPress: () => {
          void deleteSpace({ id }).then(
            () => analytics.capture("space_deleted"),
            (err) => analytics.captureError("space_delete_failed", err),
          );
        },
      },
    ]);
  };

  const header = (
    <ScreenHeader
      clock={clock}
      title={t("navigation.spacesHeader")}
      right={
        <HeaderIconButton
          icon="plus"
          label={t("spaces.newTitle")}
          onPress={() => router.push("/new-space")}
        />
      }
    />
  );

  if (spaces === undefined) {
    return (
      <View style={styles.container}>
        {header}
        <ScreenLoader label={t("loading.spaces")} />
      </View>
    );
  }

  if (spaces.length === 0) {
    return (
      <View style={styles.container}>
        {header}
        <EmptyState
          title={t("spaces.listEmptyTitle")}
          message={t("spaces.listEmptyBody")}
        />
      </View>
    );
  }

  // The uprights run the height of the rows, so the list reads as one piece of
  // furniture rather than a stack of separate shelves.
  const bodyHeight = (spaces.length + 1) * ROW_HEIGHT;

  return (
    <View style={styles.container}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <View style={styles.uprights} pointerEvents="none">
            <InkUprights width={width} height={bodyHeight} clock={clock} />
          </View>

          {spaces.map((space, index) => (
            <View key={space._id} style={styles.row}>
              <Link href={`/space/${space._id}`} asChild>
                <Pressable
                  style={styles.rowPress}
                  testID={
                    space.fixtureKey
                      ? `fixture-space-${space.fixtureKey}`
                      : undefined
                  }
                  accessibilityRole="button"
                  accessibilityLabel={space.name}
                >
                  <View style={styles.rowText}>
                    <View style={styles.nameLine}>
                      <TypeMark
                        kind={shelfMark(space)}
                        size={20}
                        clock={clock}
                        seed={index}
                      />
                      <Text style={styles.name} numberOfLines={1}>
                        {space.name}
                      </Text>
                    </View>
                    <Eyebrow>
                      {space.suggestionCount > 0
                        ? `${t("spaces.saveCount", { count: space.itemCount })} · ${t("spaces.suggestionCount", { count: space.suggestionCount })}`
                        : t("spaces.saveCount", { count: space.itemCount })}
                    </Eyebrow>
                  </View>

                  <View style={styles.thumbs}>
                    {(space.previews ?? [])
                      .slice(0, THUMBS_PER_ROW)
                      .map((preview, i) => (
                        <ShelfThumbnail
                          key={`${space._id}-${i}`}
                          imageUrl={preview.url}
                          suggested={preview.suggested}
                          tilt={cardTilt(index * THUMBS_PER_ROW + i)}
                        />
                      ))}
                  </View>
                </Pressable>
              </Link>

              <InkShelf width={width} clock={clock} seed={index} />

              <ActionMenu
                label={t("spaces.actions")}
                title={t("spaces.actions")}
                actions={[
                  {
                    label: t("common.delete"),
                    destructive: true,
                    onPress: () => confirmDelete(space._id),
                  },
                ]}
                style={styles.menuButton}
              >
                <InkIcon name="ellipsis" size={15} tint={theme.colors.muted} />
              </ActionMenu>
            </View>
          ))}

          {/* The empty shelf at the bottom is the invitation to make another. */}
          <Pressable
            style={styles.row}
            onPress={() => router.push("/new-space")}
            accessibilityRole="button"
            accessibilityLabel={t("spaces.newTitle")}
          >
            <View style={styles.rowPress}>
              <View style={styles.nameLine}>
                <InkIcon name="plus" size={18} tint={theme.colors.muted} />
                <Text style={[styles.name, styles.newName]}>
                  {t("spaces.newTitle")}
                </Text>
              </View>
            </View>
            <View style={styles.faintShelf}>
              <InkShelf
                width={width}
                clock={clock}
                seed={spaces.length}
                prop="plant"
              />
            </View>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

/** Row height used to size the uprights behind the list. */
const ROW_HEIGHT = 108;

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingTop: 12, paddingBottom: 24 },
  uprights: { position: "absolute", left: 0, top: 0 },
  row: { height: ROW_HEIGHT, justifyContent: "flex-end" },
  rowPress: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: 26,
    paddingBottom: 6,
    gap: 12,
  },
  rowText: { flex: 1, gap: 4, paddingBottom: 2 },
  nameLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  newName: { color: theme.colors.muted },
  thumbs: { flexDirection: "row", alignItems: "flex-end", gap: 6 },
  // The shelf under "New shelf" is drawn faint: nothing stands on it yet.
  faintShelf: { opacity: 0.45 },
  menuButton: {
    position: "absolute",
    right: 0,
    top: 0,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
}));
