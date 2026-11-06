import { EmptyState } from "@/components/empty-state";
import {
  ListTile,
  NewListTile,
  TILE,
} from "@/components/home/shared-lists-section";
import { ScreenTitle } from "@/components/screen-title";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { canBrowse } from "@/lib/access";
import { analytics } from "@/lib/analytics";
import { useAccess } from "@/lib/free-plan";
import { sharedListCover } from "@/lib/home-places";
import { t, useAppLocale } from "@/lib/i18n";
import { useSharedLists } from "@/lib/shared-lists";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const SIDE = 20;
const COLUMNS = 3;

export function AllSharedLists() {
  useAppLocale();
  const { width } = useWindowDimensions();
  const lists = useSharedLists();
  const browsing = canBrowse(useAccess());
  const cities = useQuery(
    convexQuery(api.items.listCities, browsing ? {} : "skip"),
  );
  const mine = browsing ? cities.data : undefined;
  useEffect(() => {
    if (lists.error)
      analytics.captureError("shared_lists_load_failed", lists.error);
  }, [lists.error]);
  const columnGap = Math.max(
    8,
    Math.floor((width - SIDE * 2 - TILE * COLUMNS) / (COLUMNS - 1)),
  );
  let body = <ScreenLoader />;
  if (lists.data !== undefined) {
    body = (
      <ScrollView contentContainerStyle={[styles.grid, { columnGap }]}>
        <NewListTile />
        {lists.data.map((list) => (
          <ListTile
            key={list._id}
            list={list}
            cover={sharedListCover(list.cities, mine)}
          />
        ))}
      </ScrollView>
    );
  } else if (lists.isError) {
    body = (
      <EmptyState
        title={t("errors.unexpectedTitle")}
        message={t("errors.retrySoon")}
      />
    );
  }
  return (
    <View style={styles.screen}>
      <ScreenTitle title={t("sharedLists.title")} />
      {body}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: theme.gap(2.5),
    paddingHorizontal: SIDE,
    paddingBottom: rt.insets.bottom + theme.gap(4),
  },
}));
