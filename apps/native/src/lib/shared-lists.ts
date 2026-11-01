import { analytics } from "@/lib/analytics";
import { type CityPin, cityPinId } from "@/lib/city-pins";
import type { CityPlanKind } from "@/lib/city-plan";
import { t } from "@/lib/i18n";
import { shareUrl } from "@/lib/share-link";
import { webUrl } from "@/lib/web-url";
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

const MAX_ALSO_ADD_LISTS = 3;

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
  return webUrl(`/l/${encodeURIComponent(token)}`);
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

function otherNames(members: NamedMember[]): string[] {
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

export function inCity(place: { city?: string }, city: string): boolean {
  return place.city !== undefined && cityKey(place.city) === cityKey(city);
}

export function listRows(places: SharedListPlace[], city: string): ListRow[] {
  const shown = places.filter((place) => inCity(place, city));
  const ordered = [
    ...shown.filter((place) => place.isNew),
    ...shown.filter((place) => !place.isNew),
  ];
  return ordered.map((place, index) => ({
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
}

export type ListSectionRow =
  | { kind: "heading"; id: string; label: string; fresh: boolean }
  | { kind: "place"; id: string; row: ListRow };

export function listSectionRows(
  rows: ListRow[],
  partner: string,
): ListSectionRow[] {
  const place = (row: ListRow): ListSectionRow => ({
    kind: "place",
    id: cityPinId(row.pin),
    row,
  });
  const fresh = rows.filter((row) => row.place.isNew);
  const rest = rows.filter((row) => !row.place.isNew);
  if (fresh.length === 0) return rest.map(place);
  return [
    {
      kind: "heading",
      id: "fresh",
      label: t("sharedLists.newFrom", { name: partner }),
      fresh: true,
    },
    ...fresh.map(place),
    ...(rest.length > 0
      ? [
          {
            kind: "heading" as const,
            id: "rest",
            label: t("sharedLists.everythingElse"),
            fresh: false,
          },
        ]
      : []),
    ...rest.map(place),
  ];
}

export function savedByLine(place: SharedListPlace): string {
  if (place.addedByYou) return t("sharedLists.youSaved");
  return place.addedByName === undefined
    ? t("sharedLists.pastMemberSaved")
    : t("sharedLists.savedBy", { name: place.addedByName });
}

type AlsoAddState = Record<string, "off" | "adding" | "on" | "removing">;

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

export function useListPlan(listId: Id<"sharedLists">, city: string) {
  const router = useRouter();
  return useCallback(
    (kind: CityPlanKind) => {
      analytics.capture("city_plan_started", { kind });
      router.push({
        pathname: kind === "date" ? "/date-plan" : "/new-trip",
        params: { city, listId },
      });
    },
    [router, city, listId],
  );
}
