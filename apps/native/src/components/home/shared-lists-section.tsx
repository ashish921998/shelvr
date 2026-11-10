import { SectionHeading } from "@/components/home/section-heading";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { withAlpha } from "@/lib/color";
import { type City, sharedListCover } from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import {
  type SharedListSummary,
  useSharedLists,
  withLine,
} from "@/lib/shared-lists";
import { useReportLoadFailure } from "@/lib/use-report-load-failure";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export const TILE = 104;

export function ListTile({
  list,
  cover,
  size = TILE,
}: {
  list: SharedListSummary;
  cover: string | null;
  size?: number;
}) {
  const box = { width: size, height: size };
  const router = useRouter();
  const places = t("homePlaces.spotCount", { count: list.placeCount });
  const fresh =
    list.newCount > 0
      ? t("sharedLists.newCount", { count: list.newCount })
      : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[
        list.name,
        `${withLine(list.members)} · ${places}`,
        fresh,
      ]
        .filter(Boolean)
        .join(", ")}
      onPress={() =>
        router.push({ pathname: "/shared-list/[id]", params: { id: list._id } })
      }
      style={({ pressed }) => [
        styles.listTile,
        { width: size },
        pressed && styles.pressed,
      ]}
    >
      <View style={box}>
        {cover ? (
          <Image
            source={{ uri: cover }}
            style={[styles.photo, box]}
            contentFit="cover"
          />
        ) : (
          <View style={[styles.photo, box, styles.soft]}>
            <Text style={styles.pin}>📍</Text>
          </View>
        )}
        {fresh ? (
          <View style={styles.badge}>
            <ThemedText variant="captionStrong" style={styles.badgeText}>
              {fresh}
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText style={styles.name} numberOfLines={1}>
        {list.name}
      </ThemedText>
    </Pressable>
  );
}

export function NewListTile({ size = TILE }: { size?: number }) {
  const router = useRouter();
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("sharedLists.newList")}
      onPress={() => router.push("/new-shared-list")}
      style={({ pressed }) => [
        styles.startTile,
        { width: size, height: size },
        pressed && styles.pressed,
      ]}
    >
      <AppSymbolIcon name="plus" size={22} tintColor={theme.colors.muted} />
      <ThemedText style={styles.startLabel}>
        {t("sharedLists.newList")}
      </ThemedText>
    </Pressable>
  );
}

export function SharedListsSection({ cities }: { cities?: City[] }) {
  useAppLocale();
  const router = useRouter();
  const lists = useSharedLists();
  useReportLoadFailure("home_shared_lists_load_failed", lists);
  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <SectionHeading>{t("sharedLists.title")}</SectionHeading>
        {lists.data?.length ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.seeAll")}
            hitSlop={12}
            onPress={() => router.push("/shared-lists")}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <ThemedText style={styles.seeAll}>{t("common.seeAll")}</ThemedText>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        <NewListTile />
        {lists.data === undefined && lists.errorUpdateCount > 0 ? (
          <View style={styles.failed}>
            <ThemedText style={styles.failedTitle}>
              {t("errors.unexpectedTitle")}
            </ThemedText>
            <ThemedText style={styles.failedText}>
              {t("errors.retrySoon")}
            </ThemedText>
            {lists.isFetching ? (
              <ActivityIndicator
                accessibilityLabel={t("common.loading")}
                style={[styles.retry, styles.retrying]}
              />
            ) : (
              <Pressable
                accessibilityRole="button"
                onPress={() => void lists.refetch()}
                style={({ pressed }) => [
                  styles.retry,
                  pressed && styles.pressed,
                ]}
              >
                <ThemedText variant="subheadStrong" style={styles.retryLabel}>
                  {t("common.retry")}
                </ThemedText>
              </Pressable>
            )}
          </View>
        ) : null}
        {lists.data?.map((list) => (
          <ListTile
            key={list._id}
            list={list}
            cover={sharedListCover(list.cities, cities)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { gap: 17, paddingTop: theme.gap(4) },
  heading: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2.5),
  },
  seeAll: {
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    lineHeight: 21,
    color: theme.colors.primaryText,
  },
  rail: {
    gap: 12,
    paddingHorizontal: theme.gap(2.5),
    alignItems: "flex-start",
  },
  listTile: { width: TILE, gap: 7 },
  photo: {
    width: TILE,
    height: TILE,
    borderRadius: 10,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  soft: { alignItems: "center", justifyContent: "center" },
  pin: { fontSize: 32 },
  name: { fontSize: 14.6, lineHeight: 18 },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 8,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  badgeText: { fontSize: 11, lineHeight: 15, color: theme.colors.primaryText },
  startTile: {
    width: TILE,
    height: TILE,
    padding: theme.gap(1),
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    borderCurve: "continuous",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: withAlpha(theme.colors.muted, 0.42),
    backgroundColor: theme.colors.surfaceMuted,
  },
  startLabel: {
    fontSize: 14.6,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.muted,
  },
  failed: {
    width: TILE * 2,
    minHeight: TILE,
    justifyContent: "center",
    gap: 2,
  },
  failedTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 14.6,
    lineHeight: 18,
  },
  failedText: { fontSize: 14.6, lineHeight: 18, color: theme.colors.muted },
  retry: { minHeight: theme.control.minHeight, justifyContent: "center" },
  retrying: { alignSelf: "flex-start" },
  retryLabel: { color: theme.colors.primaryText },
  pressed: { opacity: theme.opacity.pressed },
}));
