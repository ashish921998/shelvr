import { AppSymbolIcon } from "@/components/symbol";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function HomeSearch({ children }: { children: ReactNode }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const trimmed = text.trim();
  useEffect(() => {
    const timer = setTimeout(() => setQuery(trimmed), 250);
    return () => clearTimeout(timer);
  }, [trimmed]);

  return (
    <>
      <View style={styles.field}>
        <AppSymbolIcon
          name="magnifyingglass"
          size={20}
          tintColor={theme.colors.muted}
        />
        <TextInput
          testID="home-search-input"
          accessibilityLabel={t("search.placeholder")}
          placeholder={t("search.placeholder")}
          placeholderTextColor={theme.colors.muted}
          value={text}
          onChangeText={setText}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          maxLength={200}
          style={styles.input}
        />
        {text.length > 0 ? (
          <HeaderIconButton
            icon="xmark"
            label={t("search.clear")}
            onPress={() => {
              setText("");
              setQuery("");
            }}
          />
        ) : null}
      </View>
      {trimmed ? (
        <SearchResults query={query} pending={query !== trimmed} />
      ) : (
        children
      )}
    </>
  );
}

function SearchResults({
  query,
  pending,
}: {
  query: string;
  pending: boolean;
}) {
  const router = useRouter();
  const result = useQuery(
    convexQuery(api.items.searchItems, query ? { query } : "skip"),
  );
  useEffect(() => {
    if (result.error)
      analytics.captureError("home_search_failed", result.error);
  }, [result.error]);

  if (pending || result.isPending) {
    return (
      <ActivityIndicator
        accessibilityLabel={t("common.loading")}
        style={styles.message}
      />
    );
  }
  if (result.isError) {
    return (
      <View style={styles.message}>
        <Text style={styles.subtitle}>{t("errors.searchTitle")}</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => void result.refetch()}
          style={styles.retry}
        >
          <Text style={styles.title}>{t("common.retry")}</Text>
        </Pressable>
      </View>
    );
  }
  if (!result.data?.length) {
    return (
      <Text accessibilityLiveRegion="polite" style={styles.messageText}>
        {t("search.noResults", { query })}
      </Text>
    );
  }
  return (
    <View style={styles.results}>
      {result.data.map((save) => (
        <Pressable
          key={save._id}
          accessibilityRole="button"
          onPress={() =>
            router.push({
              pathname: "/item/[id]",
              params: { id: save._id, from: "home" },
            })
          }
          style={({ pressed }) => [styles.row, pressed && styles.pressed]}
        >
          <Text style={styles.title} numberOfLines={2}>
            {save.title ??
              save.placePins?.[0]?.name ??
              save.places?.[0] ??
              save.url ??
              t("item.untitled")}
          </Text>
          {save.placePins?.length || save.places?.length ? (
            <Text style={styles.subtitle} numberOfLines={2}>
              {(save.placePins?.length
                ? save.placePins.map((pin) => pin.name)
                : save.places
              )?.join(" · ")}
            </Text>
          ) : null}
          {save.cities?.length ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {save.cities.join(" · ")}
            </Text>
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  field: {
    marginHorizontal: theme.gap(2),
    marginBottom: theme.gap(2),
    paddingLeft: theme.gap(1.5),
    paddingRight: theme.gap(0.5),
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surfaceMuted,
  },
  input: {
    flex: 1,
    ...theme.type.body,
    color: theme.colors.foreground,
    minHeight: theme.control.minHeight,
  },
  results: { paddingHorizontal: theme.gap(2) },
  row: {
    paddingVertical: theme.gap(2),
    gap: theme.gap(0.5),
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  title: { ...theme.type.bodyLabel, color: theme.colors.foreground },
  subtitle: { ...theme.type.footnote, color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  message: { padding: theme.gap(3), alignItems: "center" },
  messageText: {
    padding: theme.gap(3),
    ...theme.type.body,
    color: theme.colors.muted,
    textAlign: "center",
  },
  retry: {
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    paddingHorizontal: theme.gap(2),
  },
}));
