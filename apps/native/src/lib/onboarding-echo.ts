import { t } from "@/lib/i18n";
import { SAMPLE_CITIES, type SampleCityId } from "@/lib/sample-cities";

export function cityEchoText(
  picked: SampleCityId | null,
  demo: SampleCityId,
): string {
  const city = t(SAMPLE_CITIES[demo].name);
  return picked === null
    ? t("onboardingStatement.cityStart", { city })
    : t("onboardingStatement.cityPicked", { city });
}
