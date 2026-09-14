import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { MasonryFeed } from "@/components/masonry-feed";
import { useAppHeaderHeight } from "@/lib/header-layout";
import { useTabSearchQuery } from "@/lib/tab-search-query";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { ProgressiveBlurHeader } from "progressive-blur";
import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SearchScreen() {
  useAppLocale();
  const headerHeight = useAppHeaderHeight();
  // iOS types into the native header search bar. Everywhere else the floating
  // tab bar owns the field and shares its text through the tab search store.
  const [iosSearch, setIosSearch] = useState("");
  const tabBarSearch = useTabSearchQuery();
  const search = Platform.OS === "ios" ? iosSearch : tabBarSearch;
  const query = useDebounced(search.trim(), 250);

  const { data: results } = useQuery({
    ...convexQuery(api.items.searchItems, { query }),
    enabled: query.length > 0,
  });

  return (
    <View style={styles.container}>
      {Platform.OS === "ios" ? (
        <Stack.SearchBar
          placeholder={t("search.placeholder")}
          autoCapitalize="none"
          hideWhenScrolling={false}
          onChangeText={(e) => setIosSearch(e.nativeEvent.text)}
          onCancelButtonPress={() => setIosSearch("")}
        />
      ) : (
        // The header is transparent, so results start below it.
        <View style={{ height: headerHeight }} />
      )}
      {query.length === 0 ? (
        <EmptyState
          title={t("search.emptyTitle")}
          message={t("search.emptyBody")}
        />
      ) : results && results.length === 0 ? (
        <EmptyState
          title={t("search.noResultsTitle")}
          message={t("search.noResults", { query })}
        />
      ) : (
        <MasonryFeed
          items={results ?? []}
          source={{ from: "search", q: query }}
        />
      )}
      <ProgressiveBlurHeader />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
