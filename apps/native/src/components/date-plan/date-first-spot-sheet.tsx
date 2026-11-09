import { PromptSheet } from "@/components/ui/prompt-sheet";
import { ThemedText } from "@/components/ui/themed-text";
import { goOutPlaces } from "@/lib/go-out";
import { t } from "@/lib/i18n";
import { searchPlaces } from "@/lib/map-filters";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { DateStart } from "@convex/model/datePlan";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { FlatList, Pressable, TextInput } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function DateFirstSpotSheet({
  visible,
  city,
  listId,
  onClose,
  onPick,
}: {
  visible: boolean;
  city: string;
  listId?: Id<"sharedLists">;
  onClose: () => void;
  onPick: (place: DateStart) => void;
}) {
  const { theme } = useUnistyles();
  const [search, setSearch] = useState("");
  const picked = useRef<DateStart | null>(null);
  const personal = useQuery(
    convexQuery(
      api.datePlanData.listDateStarts,
      visible && !listId ? { city } : "skip",
    ),
  );
  const shared = useQuery(
    convexQuery(
      api.sharedLists.listDateStarts,
      visible && listId ? { listId, city } : "skip",
    ),
  );
  const query = listId ? shared : personal;
  const inCity = goOutPlaces(query.data ?? []);
  const matches = search.trim() ? searchPlaces(inCity, search) : inCity;
  const close = () => {
    setSearch("");
    onClose();
  };
  const finish = () => {
    const place = picked.current;
    picked.current = null;
    if (place) onPick(place);
  };
  return (
    <PromptSheet
      visible={visible}
      onClose={close}
      onDismiss={finish}
      title={t("datePlan.pickFirst")}
      body=""
      actions={null}
    >
      <TextInput
        value={search}
        onChangeText={setSearch}
        accessibilityLabel={t("map.searchPlaceholder")}
        placeholder={t("map.searchPlaceholder")}
        placeholderTextColor={theme.colors.muted}
        style={styles.search}
      />
      <FlatList
        data={matches}
        style={styles.list}
        keyExtractor={(place) =>
          place.appleId ?? JSON.stringify([place.name, place.lat, place.lng])
        }
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <ThemedText variant="footnote">
            {query.isPending
              ? t("common.loading")
              : query.isError
                ? t("errors.tryAgain")
                : search.trim()
                  ? t("map.searchNoResults", { query: search })
                  : t("plan.emptyTitle")}
          </ThemedText>
        }
        renderItem={({ item: { name, lat, lng, appleId } }) => (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => {
              if (picked.current) return;
              picked.current = {
                name,
                lat,
                lng,
                ...(appleId ? { appleId } : {}),
              };
              close();
              if (process.env.EXPO_OS !== "ios") finish();
            }}
          >
            <ThemedText variant="subheadStrong">{name}</ThemedText>
          </Pressable>
        )}
      />
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  search: {
    ...theme.type.body,
    minHeight: theme.control.minHeight,
    paddingHorizontal: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    color: theme.colors.foreground,
  },
  list: { maxHeight: 320 },
  row: {
    minHeight: theme.control.minHeight,
    justifyContent: "center",
    paddingVertical: theme.gap(1),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
  },
  pressed: { opacity: theme.opacity.pressed },
}));
