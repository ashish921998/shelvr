import { primaryGoal, type Goal } from "@/lib/onboarding-goals";
import type { getOnboardingProgress } from "@/lib/pending-onboarding";
import { t } from "@/lib/i18n";
import { SAMPLE_CITIES } from "@/lib/sample-cities";

export type GoalProgress = Pick<
  ReturnType<typeof getOnboardingProgress>,
  "goals" | "travelCity"
>;

/** What a slot's copy can depend on: the city the user picked (null for "not sure"). */
type Answers = { city: string | null };
type Copy = (answers: Answers) => string;

const withCity =
  (named: (city: string) => string, plain: () => string): Copy =>
  ({ city }) =>
    city === null ? plain() : named(city);

type GoalCopy = {
  headline: Copy;
  subline: Copy;
  photoTag: Copy;
  answer1: Copy;
  answer2: Copy;
  today: Copy;
  planTitle: Copy;
  benefitTitle: Copy;
  benefitBody: Copy;
};

const GOAL_COPY: Record<Goal, GoalCopy> = {
  travel: {
    headline: withCity(
      (city) => t("paywallGoal.travelHeadline", { city }),
      () => t("paywallGoal.travelHeadlineNoCity"),
    ),
    subline: () => t("paywallGoal.travelSubline"),
    photoTag: () => t("paywallGoal.travelPhotoTag"),
    answer1: () => t("paywallGoal.travelAnswerOne"),
    answer2: withCity(
      (city) => t("paywallGoal.travelAnswerTwo", { city }),
      () => "",
    ),
    today: withCity(
      (city) => t("paywallGoal.travelToday", { city }),
      () => t("paywallGoal.travelTodayNoCity"),
    ),
    planTitle: withCity(
      (city) => t("paywallGoal.travelPlanTitle", { city }),
      () => t("paywallGoal.travelPlanTitleNoCity"),
    ),
    benefitTitle: () => t("paywallGoal.travelBenefitTitle"),
    benefitBody: () => t("paywallGoal.travelBenefitBody"),
  },
  food: {
    headline: withCity(
      (city) => t("paywallGoal.foodHeadline", { city }),
      () => t("paywallGoal.foodHeadlineNoCity"),
    ),
    subline: () => t("paywallGoal.foodSubline"),
    photoTag: () => t("paywallGoal.foodPhotoTag"),
    answer1: () => t("paywallGoal.foodAnswerOne"),
    answer2: withCity(
      (city) => t("paywallGoal.foodAnswerTwo", { city }),
      () => "",
    ),
    today: withCity(
      (city) => t("paywallGoal.foodToday", { city }),
      () => t("paywallGoal.foodTodayNoCity"),
    ),
    planTitle: withCity(
      (city) => t("paywallGoal.foodPlanTitle", { city }),
      () => t("paywallGoal.foodPlanTitleNoCity"),
    ),
    benefitTitle: () => t("paywallGoal.foodBenefitTitle"),
    benefitBody: () => t("paywallGoal.foodBenefitBody"),
  },
  date: {
    headline: () => t("paywallGoal.dateHeadline"),
    subline: () => t("paywallGoal.dateSubline"),
    photoTag: () => t("paywallGoal.datePhotoTag"),
    answer1: () => t("paywallGoal.dateAnswerOne"),
    answer2: withCity(
      (city) => t("paywallGoal.dateAnswerTwo", { city }),
      () => "",
    ),
    today: () => t("paywallGoal.dateToday"),
    planTitle: () => t("paywallGoal.datePlanTitle"),
    benefitTitle: () => t("paywallGoal.dateBenefitTitle"),
    benefitBody: () => t("paywallGoal.dateBenefitBody"),
  },
};

const string = (value: string) => ({ type: "string" as const, value });

/**
 * Custom variables that let the paywall echo the onboarding answers, worded for
 * the goal that leads (date night, then trips, then places to eat). A skipped
 * city ("Not sure yet", "Somewhere else") is stored as null and reads as no city.
 * `goal_city` is the unlocalized city id, which the paywall uses to pick the city's photo.
 */
export function goalPaywallVariables(
  progress: GoalProgress,
): Record<string, { type: "string"; value: string }> {
  const goal = primaryGoal(progress.goals);
  if (goal === null) return {};
  const copy = GOAL_COPY[goal];
  const city = progress.travelCity;
  const answers: Answers = {
    city: city === null ? null : t(SAMPLE_CITIES[city].name),
  };
  return {
    goal: string(goal),
    goal_city: string(city ?? ""),
    goal_headline: string(copy.headline(answers)),
    goal_subline: string(copy.subline(answers)),
    goal_photo_tag: string(copy.photoTag(answers)),
    goal_answer_1: string(copy.answer1(answers)),
    goal_answer_2: string(copy.answer2(answers)),
    goal_today: string(copy.today(answers)),
    goal_plan_title: string(copy.planTitle(answers)),
    goal_benefit_title: string(copy.benefitTitle(answers)),
    goal_benefit_body: string(copy.benefitBody(answers)),
  };
}
