import { EmptyState } from '@/components/empty-state';
import { AppSymbolIcon } from '@/components/symbol';
import { MasonryFeed } from '@/components/masonry-feed';
import { useAppHeaderHeight } from '@/lib/header-layout';
import { api } from '@convex/_generated/api';
import { convexQuery } from '@convex-dev/react-query';
import { useQuery } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { ProgressiveBlurHeader } from 'progressive-blur';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { Keyboard, Platform, TextInput, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export default function SearchScreen() {
  const { theme } = useUnistyles();
  const headerHeight = useAppHeaderHeight();
  const searchBarRef = useRef<ComponentRef<typeof Stack.SearchBar>>(null);
  const [search, setSearch] = useState('');
  const query = useDebounced(search.trim(), 250);

  const { data: results } = useQuery({
    ...convexQuery(api.items.searchItems, { query }),
    enabled: query.length > 0,
  });

  return (
    <View style={styles.container}>
      {Platform.OS === 'ios' ? (
        <Stack.SearchBar
          ref={searchBarRef}
          placeholder="Search your saves"
          autoCapitalize="none"
          hideWhenScrolling={false}
          onChangeText={(e) => setSearch(e.nativeEvent.text)}
          onCancelButtonPress={() => setSearch('')}
        />
      ) : (
        <View style={[styles.searchField, { marginTop: headerHeight + theme.gap(2) }]}>
          <AppSymbolIcon name="magnifyingglass" size={20} tintColor={theme.colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your saves"
            placeholderTextColor={theme.colors.muted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={Keyboard.dismiss}
            accessibilityLabel="Search your saves"
            style={styles.searchInput}
          />
        </View>
      )}
      {query.length === 0 ? (
        <EmptyState
          title="Find anything"
          message={'Search goes through titles, tags, and\ndescriptions Shelvr wrote for your saves.'}
        />
      ) : results && results.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          message={`No saves match “${query}”.`}
        />
      ) : (
        <MasonryFeed
          items={results ?? []}
          source={{ from: 'search', q: query }}
          onScrollBeginDrag={() => searchBarRef.current?.blur()}
        />
      )}
      <ProgressiveBlurHeader />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  searchField: {
    flexShrink: 0,
    marginHorizontal: theme.gap(2),
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.gap(1),
    paddingHorizontal: theme.gap(2),
    borderRadius: 18,
    borderCurve: 'continuous',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.foreground,
  },
}));
