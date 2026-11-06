import { appSchemeRoute } from "@/lib/home-href";
import { isPublicMapToken } from "@convex/model/publicMap";
import { MAX_CITY_CHARS, tidyCity } from "@convex/model/trip";

export function creatorMapHref(token: string, city: string): string {
  return `/creator-map/${encodeURIComponent(token)}?city=${encodeURIComponent(city)}`;
}

export function creatorMapRoute(link: string): string | null {
  const route = appSchemeRoute(link);
  if (route === null || !route.startsWith("/?")) return null;
  const params = new URLSearchParams(route.slice(1));
  const token = params.get("creatorMap") ?? "";
  const city = tidyCity(params.get("city") ?? "");
  if (!isPublicMapToken(token)) return null;
  if (city.length === 0 || city.length > MAX_CITY_CHARS) return null;
  return creatorMapHref(token, city);
}
