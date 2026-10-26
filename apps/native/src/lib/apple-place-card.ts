import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import {
  openPlaceCard,
  placeCardAvailable,
} from "../../modules/apple-place-card";

let cardOpen = false;

export function canOpenPlaceCard(appleId: string | undefined): boolean {
  return appleId !== undefined && placeCardAvailable();
}

/** Apple's place card for the venue when it can be shown, otherwise the save, as before. */
export async function openPlaceOrSave(
  appleId: string | undefined,
  saveTitle: string,
  openSave: () => void,
): Promise<void> {
  if (cardOpen) return;
  if (appleId === undefined || !canOpenPlaceCard(appleId)) return openSave();
  cardOpen = true;
  let result: Awaited<ReturnType<typeof openPlaceCard>> = "unavailable";
  try {
    result = await openPlaceCard({
      appleId,
      saveTitle,
      fromYourSave: t("cityMap.fromYourSave"),
      openSave: t("cityMap.openSave"),
    });
  } catch (error) {
    analytics.captureError("place_card_failed", error);
  } finally {
    cardOpen = false;
  }
  if (result !== "dismissed") openSave();
}
