import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { MasonryFeed } from "@/components/masonry-feed";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { InkIcon } from "@/components/ink/ink-icon";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

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
  const { theme } = useUnistyles();
  const inputRef = useRef<TextInput>(null);
  // The screen owns its field now. The nav is five equal tabs with nothing in
  // them, so there is no bar field to share text with.
  const [search, setSearch] = useState("");
  const query = useDebounced(search.trim(), 250);

  const { data: results } = useQuery({
    ...convexQuery(api.items.searchItems, { query }),
    enabled: query.length > 0,
  });

  return (
    <View style={styles.container}>
      <ScreenHeader title={t("navigation.search")} />
      <View style={styles.field}>
        <InkIcon name="magnifyingglass" size={16} tint={theme.colors.muted} />
        <TextInput
          ref={inputRef}
          style={styles.input}
          value={search}
          onChangeText={setSearch}
          placeholder={t("search.placeholder")}
          placeholderTextColor={theme.colors.faint}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          selectionColor={theme.colors.primary}
          accessibilityLabel={t("search.placeholder")}
          testID="search-field"
        />
      </View>
      {query.length === 0 ? (
        <EmptyState
          title={t("search.emptyTitle")}
          message={t("search.emptyBody")}
          prop={null}
        />
      ) : results && results.length === 0 ? (
        <EmptyState
          title={t("search.noResultsTitle")}
          message={t("search.noResults", { query })}
          prop={null}
        />
      ) : (
        <MasonryFeed
          items={results ?? []}
          source={{ from: "search", q: query }}
          onScrollBeginDrag={() => inputRef.current?.blur()}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1 },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 8,
    marginBottom: 12,
    height: 52,
    paddingHorizontal: 14,
    borderRadius: 11,
    backgroundColor: theme.colors.surfaceMuted,
  },
  input: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.foreground,
  },
}));
