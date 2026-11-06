import { SettingsRow } from "@/components/ui/settings-list";
import { useBeenCities, useOpenBeenEditor } from "@/lib/been-cities";
import { t, useAppLocale } from "@/lib/i18n";
import { usePlanGate } from "@/lib/plan-gate";

function BeenCitiesCountRow() {
  useAppLocale();
  const { ids } = useBeenCities();
  const openEditor = useOpenBeenEditor();
  const label = t("been.citiesTitle");
  const count = ids?.length;
  const value =
    count === undefined
      ? undefined
      : count === 0
        ? t("been.none")
        : t("been.cityCount", { count });
  return (
    <SettingsRow
      label={label}
      value={value}
      accessibilityLabel={value === undefined ? label : `${label}, ${value}`}
      testID="profile-been-cities"
      onPress={() => openEditor("profile", count ?? 0)}
    />
  );
}

export function BeenCitiesRow() {
  const { gated, planUnknown } = usePlanGate();
  return gated || planUnknown ? null : <BeenCitiesCountRow />;
}
