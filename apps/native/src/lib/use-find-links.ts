import { t, useAppLocale } from "@/lib/i18n";
import type { DetailItem } from "@/components/item-detail";
import { api } from "@convex/_generated/api";
import { isAiConsentRequired } from "@convex/model/aiConsent";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Alert } from "react-native";
import { usePaywallGuard } from "./entitlement";

// `productsStatus` is optional: a card row has not loaded it yet, and the
// server refuses a duplicate search anyway.
type SearchableItem = Pick<DetailItem, "_id" | "status" | "productsStatus">;

export function useFindLinks(item: SearchableItem | undefined) {
  useAppLocale();
  const router = useRouter();
  const search = useMutation(api.items.findLinks);
  const { guard, loading } = usePaywallGuard("item_detail");
  const inFlight = useRef(false);
  const [finding, setFinding] = useState(false);
  const disabled =
    loading ||
    finding ||
    !item ||
    item.status !== "ready" ||
    item.productsStatus === "searching" ||
    item.productsStatus === "unavailable";

  const findLinks = useCallback(async () => {
    if (disabled || !item || inFlight.current) return;
    inFlight.current = true;
    setFinding(true);
    try {
      if (await guard()) await search({ id: item._id });
    } catch (error) {
      if (isAiConsentRequired(error)) {
        // Find links is an AI feature the user turned off; point at the switch.
        Alert.alert(t("products.findLinks"), t("aiConsent.findLinksOff"), [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("profile.settings"),
            onPress: () => router.push("/settings"),
          },
        ]);
        return;
      }
      Alert.alert(t("errors.searchTitle"), t("errors.retrySoon"));
    } finally {
      inFlight.current = false;
      setFinding(false);
    }
  }, [disabled, item, guard, search, router]);

  return { findLinks, finding, disabled };
}
