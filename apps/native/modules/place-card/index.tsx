import { requireNativeView, requireOptionalNativeModule } from "expo";
import { useState } from "react";
import {
  Platform,
  type NativeSyntheticEvent,
  type ViewProps,
} from "react-native";
import { analytics } from "@/lib/analytics";

type Props = { placeName: string; latitude: number; longitude: number };
type NativeProps = Props &
  ViewProps & {
    onStatus: (
      event: NativeSyntheticEvent<{ status: "ready" | "unavailable" }>,
    ) => void;
    onHeight: (event: NativeSyntheticEvent<{ height: number }>) => void;
  };

const module =
  Platform.OS === "ios"
    ? requireOptionalNativeModule<{ configured: boolean }>("PlaceCard")
    : null;
const NativeCard = module?.configured
  ? requireNativeView<NativeProps>("PlaceCard")
  : null;

export function GooglePlaceCard(props: Props) {
  const [height, setHeight] = useState(220);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(
    "loading",
  );
  if (!NativeCard || status === "unavailable") return null;
  return (
    <NativeCard
      {...props}
      style={{
        height: status === "ready" ? height : 1,
        opacity: status === "ready" ? 1 : 0,
      }}
      onHeight={({ nativeEvent }) => {
        if (Number.isFinite(nativeEvent.height) && nativeEvent.height > 0)
          setHeight(nativeEvent.height);
      }}
      onStatus={({ nativeEvent }) => {
        setStatus(nativeEvent.status);
        if (nativeEvent.status === "unavailable") {
          analytics.captureError(
            "place_card_unavailable",
            new Error("Place card unavailable"),
          );
        }
      }}
    />
  );
}
