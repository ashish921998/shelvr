import { t, useAppLocale } from "@/lib/i18n";
import { searchView } from "@/lib/search-view";
import { EmptyState } from "@/components/empty-state";
import { MasonryFeed } from "@/components/masonry-feed";
import { useAppHeaderHeight } from "@/lib/header-layout";
import { useTabSearchQuery } from "@/lib/tab-search-query";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { HeaderScrim } from "@/components/ui/header-scrim";
import { useEffect, useRef, useState, type ComponentRef } from "react";
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
  const searchBarRef = useRef<ComponentRef<typeof Stack.SearchBar>>(null);
  const { q, t: requestedAt } = useLocalSearchParams<{
    q?: string;
    t?: string;
  }>();
  const [iosSearch, setIosSearch] = useState(q ?? "");
  const request = q ? `${requestedAt ?? ""}|${q}` : null;
  const [appliedRequest, setAppliedRequest] = useState(request);
  if (request !== appliedRequest) {
    setAppliedRequest(request);
    if (q) setIosSearch(q);
  }
  useEffect(() => {
    if (q) searchBarRef.current?.setText(q);
  }, [q, requestedAt]);
  const tabBarSearch = useTabSearchQuery();
  const search = Platform.OS === "ios" ? iosSearch : tabBarSearch;
  const query = useDebounced(search.trim(), 250);

  // 'skip', not `enabled`: a disabled React Query still subscribes through
  // the Convex adapter (see the pager), so an empty query would hold a live
  // server subscription that answers [] on every push.
  // Results carry over only from one query to the next, never across a
  // cleared field: after a clear, the next query starts blank.
  const [cleared, setCleared] = useState(query.length === 0);
  if (query.length === 0 && !cleared) setCleared(true);
  const results = useQuery({
    ...convexQuery(
      api.items.searchItems,
      query.length > 0 ? { query } : "skip",
    ),
    placeholderData: cleared ? undefined : keepPreviousData,
  });
  if (
    cleared &&
    query.length > 0 &&
    results.data !== undefined &&
    !results.isPlaceholderData
  ) {
    setCleared(false);
  }
  const view = searchView(query, results);

  return (
    <View style={styles.container}>
      {Platform.OS === "ios" ? (
        <Stack.SearchBar
          ref={searchBarRef}
          placeholder={t("search.placeholder")}
          autoCapitalize="none"
          hideWhenScrolling={false}
          onChangeText={(e) => setIosSearch(e.nativeEvent.text)}
          onCancelButtonPress={() => setIosSearch("")}
        />
      ) : (
        <View style={{ height: headerHeight }} />
      )}
      {view.kind === "message" ? (
        <EmptyState
          animateEntrance={false}
          title={view.title}
          message={view.message}
        />
      ) : (
        <MasonryFeed
          items={view.items}
          source={{ from: "search", q: query }}
          onScrollBeginDrag={() => searchBarRef.current?.blur()}
        />
      )}
      <HeaderScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
