import { AppSymbolIcon } from "@/components/symbol";
import { MapRoundButton } from "@/components/map/map-round-button";
import { MapSearchField } from "@/components/map/map-search";
import { ThemedText } from "@/components/ui/themed-text";
import { Wordmark } from "@/components/wordmark";
import { t } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export const MAP_HEADER_HEIGHT = 58;

function CityTitle({ city }: { city: string }) {
  const router = useRouter();
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={city}
      onPress={() =>
        router.push({ pathname: "/city/[name]", params: { name: city } })
      }
      style={({ pressed }) => [styles.title, pressed && styles.pressed]}
    >
      <ThemedText
        variant="hero"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.city}
      >
        {city}
      </ThemedText>
      <AppSymbolIcon
        name="chevron.right"
        size={20}
        weight="semibold"
        tintColor={theme.colors.foreground}
      />
    </Pressable>
  );
}

export function MapHeader({
  city,
  canSearch,
  searchOpen,
  text,
  onChangeText,
  onOpenSearch,
  onCancel,
}: {
  city?: string;
  canSearch: boolean;
  searchOpen: boolean;
  text: string;
  onChangeText: (text: string) => void;
  onOpenSearch: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const { rt } = useUnistyles();
  let left = (
    <View style={styles.title}>
      <Wordmark size={28} />
    </View>
  );
  if (searchOpen) {
    left = <MapSearchField text={text} onChangeText={onChangeText} />;
  } else if (city) {
    left = <CityTitle city={city} />;
  }
  let right = null;
  if (searchOpen) {
    right = (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("common.cancel")}
        onPress={onCancel}
        style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}
      >
        <ThemedText variant="body">{t("common.cancel")}</ThemedText>
      </Pressable>
    );
  } else if (canSearch) {
    right = (
      <MapRoundButton
        icon="magnifyingglass"
        label={t("map.searchPlaceholder")}
        onPress={onOpenSearch}
      />
    );
  }
  return (
    <View style={[styles.row, { top: rt.insets.top }]}>
      {left}
      {right}
      <MapRoundButton
        icon="person.fill"
        label={t("navigation.profile")}
        onPress={() => router.push("/profile")}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    minHeight: MAP_HEADER_HEIGHT,
    paddingHorizontal: theme.gap(2),
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  title: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.5),
  },
  city: {
    flexShrink: 1,
    lineHeight: 58,
    textShadowColor: theme.colors.background,
    textShadowRadius: 8,
    textShadowOffset: { width: 0, height: 0 },
  },
  cancel: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1),
  },
  pressed: { opacity: theme.opacity.pressed },
}));
