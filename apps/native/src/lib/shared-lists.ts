import { analytics } from "@/lib/analytics";
import { canOpenPlaceCard } from "@/lib/apple-place-card";
import type { CityPin } from "@/lib/city-pins";
import type { CityPlanKind } from "@/lib/city-plan";
import { t } from "@/lib/i18n";
import { shareUrl } from "@/lib/share-link";
import { type StopAction, stopAction } from "@/lib/trip-planner";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { cityKey } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { useRouter } from "expo-router";
import { useCallback, useState } from "react";
import { Share } from "react-native";

export type SharedListSummary = FunctionReturnType<
  typeof api.sharedLists.listSharedLists
>[number];
export type SharedListDetail = NonNullable<
  FunctionReturnType<typeof api.sharedLists.getSharedList>
>;
export type SharedListPlace = SharedListDetail["places"][number];

export const MAX_ALSO_ADD_LISTS = 3;

export function useSharedLists(enabled = true) {
  const { isAuthenticated } = useConvexAuth();
  return useQuery(
    convexQuery(
      api.sharedLists.listSharedLists,
      enabled && isAuthenticated ? {} : "skip",
    ),
  );
}

export function inviteUrl(token: string): string {
  const origin =
    process.env.EXPO_PUBLIC_WEB_URL || "https://shelvr-web.vercel.app";
  return new URL(`/l/${encodeURIComponent(token)}`, origin).href;
}

export async function shareInvite(
  token: string,
  surface: "new" | "list",
): Promise<boolean> {
  try {
    const result = await shareUrl(inviteUrl(token));
    const shared = result.action === Share.sharedAction;
    analytics.capture("shared_list_invite_sent", { shared, surface });
    return shared;
  } catch (error) {
    analytics.captureError("shared_list_invite_failed", error);
    return false;
  }
}

type NamedMember = { firstName?: string; isYou: boolean };

export function otherNames(members: NamedMember[]): string[] {
  return members
    .filter((member) => !member.isYou)
    .map((member) => member.firstName ?? t("sharedLists.someone"));
}

export function withLine(members: NamedMember[]): string {
  const names = otherNames(members);
  return names.length === 0
    ? t("sharedLists.onlyYou")
    : t("sharedLists.with", { names: names.join(", ") });
}

export function partnerName(members: NamedMember[]): string {
  return otherNames(members)[0] ?? t("sharedLists.someone");
}

export type ListRow = { place: SharedListPlace; pin: CityPin };

export function defaultListCity(cities: string[]): string | null {
  return cities[0] ?? null;
}

export function inCity(place: { city?: string }, city: string | null): boolean {
  return (
    city === null ||
    place.city === undefined ||
    cityKey(place.city) === cityKey(city)
  );
}

export function listRows(
  places: SharedListPlace[],
  city: string | null,
): { fresh: ListRow[]; rest: ListRow[] } {
  const shown = places.filter((place) => inCity(place, city));
  const ordered = [
    ...shown.filter((place) => place.isNew),
    ...shown.filter((place) => !place.isNew),
  ];
  const rows = ordered.map((place, index) => ({
    place,
    pin: {
      itemId: place._id,
      name: place.name,
      lat: place.lat,
      lng: place.lng,
      ...(place.appleId !== undefined ? { appleId: place.appleId } : {}),
      ...(place.category !== undefined ? { category: place.category } : {}),
      number: index + 1,
    },
  }));
  return {
    fresh: rows.filter((row) => row.place.isNew),
    rest: rows.filter((row) => !row.place.isNew),
  };
}

export function listPlaceAction(
  place: Pick<SharedListPlace, "itemId" | "appleId" | "name" | "lat" | "lng">,
  cardAvailable = canOpenPlaceCard(place.appleId),
): StopAction {
  return stopAction({ source: "save", ...place }, cardAvailable);
}

export function savedByLine(place: SharedListPlace): string {
  if (place.addedByYou) return t("sharedLists.youSaved");
  return place.addedByName === undefined
    ? t("sharedLists.pastMemberSaved")
    : t("sharedLists.savedBy", { name: place.addedByName });
}

export type AlsoAddState = Record<string, "off" | "adding" | "on" | "removing">;

export function alsoAddLists(
  lists: SharedListSummary[] | undefined,
): SharedListSummary[] {
  return (lists ?? []).slice(0, MAX_ALSO_ADD_LISTS);
}

export function nextAlsoAddState(
  current: AlsoAddState[string] | undefined,
): "add" | "remove" | null {
  switch (current) {
    case undefined:
    case "off":
      return "add";
    case "on":
      return "remove";
    case "adding":
    case "removing":
      return null;
  }
}

export function useAlsoAddTo(itemId: Id<"items">, city: string) {
  const add = useMutation(api.sharedLists.addSavePlaces);
  const remove = useMutation(api.sharedLists.removeSavePlaces);
  const [state, setState] = useState<AlsoAddState>({});
  const toggle = useCallback(
    async (listId: Id<"sharedLists">) => {
      const action = nextAlsoAddState(state[listId]);
      if (action === null) return;
      setState((s) => ({
        ...s,
        [listId]: action === "add" ? "adding" : "removing",
      }));
      try {
        if (action === "add") {
          await add({ listId, itemId, city });
          analytics.capture("shared_list_place_added", { from: "spots" });
        } else {
          await remove({ listId, itemId });
        }
        setState((s) => ({ ...s, [listId]: action === "add" ? "on" : "off" }));
      } catch (error) {
        analytics.captureError("shared_list_also_add_failed", error);
        setState((s) => ({ ...s, [listId]: action === "add" ? "off" : "on" }));
      }
    },
    [state, itemId, city, add, remove],
  );
  return { state, toggle };
}

export function useListPlan(listId: Id<"sharedLists">, city: string | null) {
  const router = useRouter();
  return useCallback(
    (kind: CityPlanKind) => {
      if (city === null) return;
      analytics.capture("city_plan_started", { kind });
      router.push({
        pathname: kind === "date" ? "/date-plan" : "/new-trip",
        params: { city, listId },
      });
    },
    [router, city, listId],
  );
}
