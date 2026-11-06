import { analytics } from "@/lib/analytics";
import { t } from "@/lib/i18n";
import { makeImageFromView } from "@shopify/react-native-skia";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  type Component,
  type ComponentRef,
  type RefObject,
  useState,
} from "react";
import { Alert, type View } from "react-native";

export function cardFileName(city: string): string {
  const slug = city
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `shelvr-${slug || "city"}.png`;
}

export function useCityCardShare(
  card: RefObject<ComponentRef<typeof View> | null>,
  city: string,
  counts: { place_count: number; visited_count: number },
) {
  const [sharing, setSharing] = useState(false);
  const share = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const image = await makeImageFromView(
        card as unknown as RefObject<Component<unknown, unknown> | null>,
      );
      if (image === null || !(await Sharing.isAvailableAsync())) {
        throw new Error("card_unavailable");
      }
      const file = new File(Paths.cache, cardFileName(city));
      if (file.exists) file.delete();
      await file.write(image.encodeToBytes());
      await Sharing.shareAsync(file.uri, {
        mimeType: "image/png",
        UTI: "public.png",
        dialogTitle: t("cityCard.share"),
      });
      analytics.capture("city_card_share_sheet_opened", counts);
    } catch (error) {
      analytics.captureError("city_card_share_failed", error);
      Alert.alert(t("errors.unexpectedTitle"), t("errors.tryAgain"));
    } finally {
      setSharing(false);
    }
  };
  return { sharing, share };
}
