import { t } from "@/lib/i18n";
import { SAMPLE_CITIES, type SampleCityId } from "@/lib/sample-cities";

export function cityEchoText(
  picked: SampleCityId | null,
  demo: SampleCityId,
): string {
  const city = t(SAMPLE_CITIES[demo].name);
  if (picked === null) return t("onboardingStatement.cityStart", { city });
  return picked === demo
    ? t("onboardingStatement.cityPicked", { city })
    : t("onboardingStatement.cityFirst", {
        picked: t(SAMPLE_CITIES[picked].name),
        city,
      });
}
