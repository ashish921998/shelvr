import { t } from "@/lib/i18n";
import type { SavedCount } from "@/lib/onboarding-goals";
import { SAMPLE_CITIES, type SampleCityId } from "@/lib/sample-cities";
import type { TextMessageKey } from "@/locales/message-types";

const SAVED_ECHO: Record<SavedCount, TextMessageKey> = {
  few: "onboardingStatement.savedFew",
  tenToFifty: "onboardingStatement.savedTenToFifty",
  fiftyToTwoHundred: "onboardingStatement.savedFiftyToTwoHundred",
  hundreds: "onboardingStatement.savedHundreds",
  lostCount: "onboardingStatement.savedLostCount",
};

export function savedEchoText(count: SavedCount | null): string {
  return t(SAVED_ECHO[count ?? "hundreds"]);
}

export function cityEchoText(
  picked: SampleCityId | null,
  demo: SampleCityId,
): string {
  const city = t(SAMPLE_CITIES[demo].name);
  return picked === demo
    ? t("onboardingStatement.cityPicked", { city })
    : t("onboardingStatement.cityFirst", { city });
}
