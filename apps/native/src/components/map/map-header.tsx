import { BackCircle } from "@/components/back-circle";
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
        variant="displayTitle"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.6}
        style={styles.city}
      >
        {city}
      </ThemedText>
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
      <BackCircle label={t("map.showAllCities")} onPress={onShowAllCities} />
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
    gap: 7,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 14 },
  title: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
  },
  city: {
    flexShrink: 1,
    fontSize: 32,
    lineHeight: 44,
    textShadowColor: theme.colors.frame,
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 0 },
  },
  cancel: {
    height: 48,
    justifyContent: "center",
    paddingHorizontal: theme.gap(1),
  },
  pressed: { opacity: theme.opacity.pressed },
}));
