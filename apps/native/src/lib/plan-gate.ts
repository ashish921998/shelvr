import type { EntitlementStatus } from "@/lib/entitlement";

type PlanGateOffer =
  | { kind: "winback"; placement: "winback"; places: number }
  | { kind: "intro"; placement: "intro" };

/** Someone whose Pro ended gets the comeback offer; everyone else the new-member intro price. */
export function planGateOffer(
  status: EntitlementStatus,
  cities: readonly { placeCount?: number }[] | undefined,
): PlanGateOffer {
  if (status !== "lapsed") return { kind: "intro", placement: "intro" };
  const places = (cities ?? []).reduce(
    (sum, city) => sum + (city.placeCount ?? 0),
    0,
  );
  return { kind: "winback", placement: "winback", places };
}
