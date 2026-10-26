import { AppSymbolIcon } from "@/components/symbol";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { t } from "@/lib/i18n";
import { Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Result = { id: string; name: string; city?: string };

/** The search field over the map; while it holds text, the matches list under it. */
export function MapSearch({
  text,
  onChangeText,
  results,
  onSelect,
}: {
  text: string;
  onChangeText: (text: string) => void;
  /** Undefined while the field is empty. */
  results: Result[] | undefined;
  onSelect: (id: string) => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.container}>
      <View style={styles.field}>
        <AppSymbolIcon
          name="magnifyingglass"
          size={20}
          tintColor={theme.colors.muted}
        />
        <TextInput
          testID="map-search-input"
          accessibilityLabel={t("map.searchPlaceholder")}
          placeholder={t("map.searchPlaceholder")}
          placeholderTextColor={theme.colors.muted}
          value={text}
          onChangeText={onChangeText}
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
            onPress={() => onChangeText("")}
          />
        ) : null}
      </View>
      {results ? (
        <View style={styles.results}>
          {results.length === 0 ? (
            <Text accessibilityLiveRegion="polite" style={styles.empty}>
              {t("map.searchNoResults", { query: text.trim() })}
            </Text>
          ) : (
            results.map((result) => (
              <Pressable
                key={result.id}
                accessibilityRole="button"
                onPress={() => onSelect(result.id)}
                style={({ pressed }) => [styles.row, pressed && styles.pressed]}
              >
                <Text style={styles.title} numberOfLines={1}>
                  {result.name}
                </Text>
                {result.city ? (
                  <Text style={styles.subtitle} numberOfLines={1}>
                    {result.city}
                  </Text>
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { paddingHorizontal: theme.gap(2), gap: theme.gap(1) },
  field: {
    paddingLeft: theme.gap(1.5),
    paddingRight: theme.gap(0.5),
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16)",
  },
  input: {
    flex: 1,
    ...theme.type.body,
    color: theme.colors.foreground,
    minHeight: theme.control.minHeight,
  },
  results: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16)",
  },
  row: {
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    gap: theme.gap(0.25),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  title: { ...theme.type.bodyLabel, color: theme.colors.foreground },
  subtitle: { ...theme.type.footnote, color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
  empty: {
    padding: theme.gap(2),
    ...theme.type.body,
    color: theme.colors.muted,
  },
}));
