import { CityCheckRow } from "@/components/city/city-check-row";
import { FormSection } from "@/components/trip-planner/trip-planner-form";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import type { MapPageCity } from "@/lib/public-map";
import { MAX_PUBLIC_MAP_CITIES } from "@convex/model/publicMapLimits";
import { StyleSheet } from "react-native-unistyles";

function placeNames(row: MapPageCity): string {
  return row.places
    .map((place) =>
      place.went ? t("publicMap.placeBeen", { name: place.name }) : place.name,
    )
    .join(", ");
}

export function MapPageCities({
  cities,
  disabled,
  onToggle,
}: {
  cities: MapPageCity[];
  disabled: boolean;
  onToggle: (city: string) => void;
}) {
  return (
    <FormSection
      title={t("publicMap.citiesLabel")}
      hint={t("publicMap.citiesHint", { count: MAX_PUBLIC_MAP_CITIES })}
    >
      {cities.map((row) => (
        <CityCheckRow
          key={row.city}
          title={row.city}
          detail={
            row.places.length > 0
              ? t("homePlaces.spotCount", { count: row.places.length })
              : t("publicMap.noPlaces")
          }
          note={
            row.picked && row.places.length > 0 ? placeNames(row) : undefined
          }
          noteTestID="map-page-names"
          selected={row.picked}
          disabled={disabled || row.disabled}
          onPress={() => onToggle(row.city)}
        />
      ))}
      <ThemedText variant="footnote" style={styles.muted}>
        {t("publicMap.leftOut")}
      </ThemedText>
    </FormSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  muted: { color: theme.colors.muted },
}));
