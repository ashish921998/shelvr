import type { ActionMenuItem } from "@/components/ui/action-menu";
import { analytics } from "@/lib/analytics";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cityKey } from "@convex/model/trip";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useCallback } from "react";
import { Alert } from "react-native";

const MAX_COVER_CITIES = 3;

type CoverableSave = {
  _id: Id<"items">;
  cities?: string[];
  imageUrl?: string | null;
  heroImageUrl?: string;
};

type CityCoverEntry = { city: string; coverItemId?: Id<"items"> };

export function coverChoices(
  item: CoverableSave | undefined,
  cities: readonly CityCoverEntry[] | undefined,
): { city: string; picked: boolean }[] {
  if (item === undefined || cities === undefined) return [];
  if (!item.imageUrl && !item.heroImageUrl) return [];
  const byKey = new Map(cities.map((entry) => [cityKey(entry.city), entry]));
  const seen = new Set<string>();
  const choices: { city: string; picked: boolean }[] = [];
  for (const name of item.cities ?? []) {
    const entry = byKey.get(cityKey(name));
    if (entry === undefined || seen.has(cityKey(name))) continue;
    seen.add(cityKey(name));
    choices.push({ city: entry.city, picked: entry.coverItemId === item._id });
  }
  return choices.slice(0, MAX_COVER_CITIES);
}

export function useCityCoverActions(
  item: CoverableSave | undefined,
): ActionMenuItem[] {
  const { data: cities } = useQuery(convexQuery(api.items.listCities, {}));
  const setCityCover = useMutation(api.cityCovers.setCityCover);
  const choose = useCallback(
    async (itemId: Id<"items">, city: string, on: boolean) => {
      try {
        await setCityCover({ itemId, city, on });
        void haptics.success();
      } catch (error) {
        analytics.captureError("city_cover_pick_failed", error);
        Alert.alert(t("item.coverFailed"), t("errors.retrySoon"));
      }
    },
    [setCityCover],
  );
  useAppLocale();
  if (item === undefined) return [];
  return coverChoices(item, cities).map(({ city, picked }) => ({
    id: `cover-${city}`,
    label: t(picked ? "item.stopCityCover" : "item.useAsCityCover", { city }),
    onPress: () => void choose(item._id, city, !picked),
  }));
}
