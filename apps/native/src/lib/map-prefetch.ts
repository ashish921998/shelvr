import { useEntitlement } from "@/lib/entitlement";
import { useHomeFeed } from "@/lib/home-feed";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

/**
 * Whether the Map tab should subscribe to its places. Native tabs mount the Map tab at launch, so it
 * waits until Home's first load (its feed page and, for Pro, its cities) has landed, keeping the read
 * off startup, or until the tab is opened first. Once on it stays on, so Map opens from the cache.
 */
export function useMapPlacesWanted(opened: boolean): boolean {
  const { items } = useHomeFeed();
  const { entitled } = useEntitlement();
  // The same query and arguments as Home's cities, so this shares Home's subscription.
  const cities = useQuery(
    convexQuery(api.items.listCities, entitled ? {} : "skip"),
  );
  const homeLoaded =
    items !== undefined &&
    (!entitled || cities.data !== undefined || cities.isError);
  const [wanted, setWanted] = useState(false);
  if (!wanted && (opened || homeLoaded)) setWanted(true);
  return wanted || opened || homeLoaded;
}
