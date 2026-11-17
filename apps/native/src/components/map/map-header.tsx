import { AppSymbolIcon } from "@/components/symbol";
import {
  MapAvatarButton,
  MapRoundButton,
} from "@/components/map/map-round-button";
import { MapSearchField } from "@/components/map/map-search";
import { ThemedText } from "@/components/ui/themed-text";
import { Wordmark } from "@/components/wordmark";
import { t } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export const MAP_HEADER_HEIGHT = 50;

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
      style={({ pressed }) => [styles.cityButton, pressed && styles.pressed]}
    >
      <ThemedText
        variant="title"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={styles.city}
      >
        {city}
      </ThemedText>
      <AppSymbolIcon
        name="chevron.right"
        size={14}
        tintColor={theme.colors.muted}
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
  onShowAllCities,
}: {
  city?: string;
  canSearch: boolean;
  searchOpen: boolean;
  text: string;
  onChangeText: (text: string) => void;
  onOpenSearch: () => void;
  onCancel: () => void;
  onShowAllCities?: () => void;
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
  const back =
    city && !searchOpen && onShowAllCities ? (
      <MapRoundButton
        icon="map"
        label={t("map.showAllCities")}
        onPress={onShowAllCities}
      />
    ) : null;
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
      {back}
      {left}
      <View style={styles.actions}>
        {right}
        <MapAvatarButton
          label={t("navigation.profile")}
          onPress={() => router.push("/profile")}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    position: "absolute",
    left: 0,
    right: 0,
    minHeight: MAP_HEADER_HEIGHT,
    paddingHorizontal: theme.gap(2.5),
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  title: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  cityButton: {
    flex: 1,
    minWidth: 0,
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    boxShadow: "0 2px 6px rgba(43, 36, 24, 0.10)",
  },
  city: {
    flex: 1,
    flexShrink: 1,
  },
  cancel: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1),
  },
  pressed: { opacity: theme.opacity.pressed },
}));
