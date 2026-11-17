import { canBrowse } from "@/lib/access";
import { useAccess } from "@/lib/free-plan";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";

export function useHomeCities() {
  const browsing = canBrowse(useAccess());
  return useQuery(convexQuery(api.items.listCities, browsing ? {} : "skip"));
}
