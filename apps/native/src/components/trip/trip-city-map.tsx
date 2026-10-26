import { CityMap } from "@/components/city/city-map";
import { cityPins, type CityPin } from "@/lib/city-pins";
import { motion } from "@/lib/motion";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import Animated, { FadeIn } from "react-native-reanimated";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

const MAP_IN = FadeIn.duration(300).easing(motion.easing.out);

/** The places the city page maps for `city`, or none while `city` is unset. */
export function useTripCityPins(city: string | undefined): CityPin[] {
  const { data } = useQuery(
    convexQuery(api.items.listCityItems, city ? { city } : "skip"),
  );
  return useMemo(() => cityPins(data ?? []), [data]);
}

/** Which map sits behind the trip sheet: until a trip has a map of its own, the city's saved places do. */
export function mapBehind(view: {
  mode: string;
  tripMap: boolean;
  revealing: boolean;
  pins: CityPin[];
}): "trip" | "city" | null {
  if (view.tripMap) return "trip";
  const cityShown =
    !view.revealing &&
    view.mode !== "days" &&
    view.mode !== "stop" &&
    view.pins.length > 0;
  return cityShown ? "city" : null;
}

export function TripCityMap({
  shown,
  pins,
  coveredShare,
}: {
  shown: boolean;
  pins: CityPin[];
  /** How much of the screen's bottom the trip sheet may cover. */
  coveredShare: number;
}) {
  const { rt } = useUnistyles();
  if (!shown) return null;
  const { height } = rt.screen;
  return (
    <Animated.View entering={MAP_IN} style={styles.fill}>
      <CityMap
        pins={pins}
        selected={null}
        height={height}
        coveredBottom={height * coveredShare}
        onSelect={() => undefined}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
});
