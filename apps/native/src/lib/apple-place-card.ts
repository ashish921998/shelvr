import { analytics } from "@/lib/analytics";
import {
  openPlaceCard,
  placeCardAvailable,
} from "../../modules/apple-place-card";

let cardOpen = false;

export function canOpenPlaceCard(appleId: string | undefined): boolean {
  return appleId !== undefined && placeCardAvailable();
}

/** Apple's place card for the venue; the save opens instead when the card cannot be shown. */
export async function openPlaceDetails(
  appleId: string,
  openSave: () => void,
): Promise<void> {
  if (cardOpen) return;
  cardOpen = true;
  let result: Awaited<ReturnType<typeof openPlaceCard>> = "unavailable";
  try {
    result = await openPlaceCard(appleId);
  } catch (error) {
    analytics.captureError("place_card_failed", error);
  } finally {
    cardOpen = false;
  }
  if (result === "unavailable") openSave();
}
