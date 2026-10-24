import {
  OptionCard,
  PillButton,
  QuestionTitle,
} from "@/components/onboarding/parts";
import { t, useAppLocale } from "@/lib/i18n";
import {
  GOALS,
  type Goal,
  type Planner,
  type SavedCount,
} from "@/lib/onboarding-goals";
import type { TextMessageKey } from "@/locales/message-types";
import type { ReactNode } from "react";
import { ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type Choice<Id extends string> = {
  id: Id;
  emoji: string;
  title: TextMessageKey;
  subtitle?: TextMessageKey;
};

const SAVED_COUNT_CHOICES: readonly Choice<SavedCount>[] = [
  { id: "few", emoji: "🌱", title: "onboardingQ.savedFew" },
  { id: "tenToFifty", emoji: "📌", title: "onboardingQ.savedTenToFifty" },
  {
    id: "fiftyToTwoHundred",
    emoji: "🗂️",
    title: "onboardingQ.savedFiftyToTwoHundred",
  },
  { id: "hundreds", emoji: "🏔️", title: "onboardingQ.savedHundreds" },
  { id: "lostCount", emoji: "🌀", title: "onboardingQ.savedLostCount" },
];

const GOAL_CHOICES: readonly Choice<Goal>[] = [
  {
    id: "date",
    emoji: "🍷",
    title: "onboardingQ.goalDate",
    subtitle: "onboardingQ.goalDateBody",
  },
  {
    id: "travel",
    emoji: "✈️",
    title: "onboardingQ.goalTravel",
    subtitle: "onboardingQ.goalTravelBody",
  },
  {
    id: "food",
    emoji: "🍜",
    title: "onboardingQ.goalFood",
    subtitle: "onboardingQ.goalFoodBody",
  },
];

const PLANNER_CHOICES: readonly Choice<Planner>[] = [
  {
    id: "planner",
    emoji: "🗓️",
    title: "onboardingQ.planner",
    subtitle: "onboardingQ.plannerBody",
  },
  {
    id: "flexible",
    emoji: "🧭",
    title: "onboardingQ.flexible",
    subtitle: "onboardingQ.flexibleBody",
  },
  {
    id: "spontaneous",
    emoji: "🎲",
    title: "onboardingQ.spontaneous",
    subtitle: "onboardingQ.spontaneousBody",
  },
  {
    id: "explorer",
    emoji: "💎",
    title: "onboardingQ.explorer",
    subtitle: "onboardingQ.explorerBody",
  },
];

function QuestionScreen({
  title,
  ready,
  onContinue,
  children,
}: {
  title: string;
  ready: boolean;
  onContinue: () => void;
  children: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        <QuestionTitle title={title} />
        <View style={styles.list}>{children}</View>
      </ScrollView>
      <PillButton
        label={t("common.continue")}
        onPress={onContinue}
        disabled={!ready}
      />
    </View>
  );
}

function SingleChoice<Id extends string>({
  title,
  choices,
  picked,
  onPick,
  onContinue,
}: {
  title: string;
  choices: readonly Choice<Id>[];
  picked: Id | null;
  onPick: (id: Id) => void;
  onContinue: () => void;
}) {
  return (
    <QuestionScreen
      title={title}
      ready={picked !== null}
      onContinue={onContinue}
    >
      {choices.map((choice) => (
        <OptionCard
          key={choice.id}
          emoji={choice.emoji}
          title={t(choice.title)}
          subtitle={choice.subtitle && t(choice.subtitle)}
          selected={picked === choice.id}
          onPress={() => onPick(choice.id)}
        />
      ))}
    </QuestionScreen>
  );
}

export function SavedCountStep({
  picked,
  onPick,
  onContinue,
}: {
  picked: SavedCount | null;
  onPick: (count: SavedCount) => void;
  onContinue: () => void;
}) {
  useAppLocale();
  return (
    <SingleChoice
      title={t("onboardingQ.savedTitle")}
      choices={SAVED_COUNT_CHOICES}
      picked={picked}
      onPick={onPick}
      onContinue={onContinue}
    />
  );
}

export function PlannerStep({
  picked,
  onPick,
  onContinue,
}: {
  picked: Planner | null;
  onPick: (planner: Planner) => void;
  onContinue: () => void;
}) {
  useAppLocale();
  return (
    <SingleChoice
      title={t("onboardingQ.plannerTitle")}
      choices={PLANNER_CHOICES}
      picked={picked}
      onPick={onPick}
      onContinue={onContinue}
    />
  );
}

export function GoalStep({
  picked,
  onChange,
  onContinue,
}: {
  picked: readonly Goal[];
  onChange: (goals: Goal[]) => void;
  onContinue: () => void;
}) {
  useAppLocale();
  const everything = GOALS.every((goal) => picked.includes(goal));
  const toggle = (goal: Goal) =>
    onChange(
      picked.includes(goal)
        ? picked.filter((value) => value !== goal)
        : [...picked, goal],
    );
  return (
    <QuestionScreen
      title={t("onboardingQ.goalTitle")}
      ready={picked.length > 0}
      onContinue={onContinue}
    >
      {GOAL_CHOICES.map((choice) => (
        <OptionCard
          key={choice.id}
          multi
          emoji={choice.emoji}
          title={t(choice.title)}
          subtitle={choice.subtitle && t(choice.subtitle)}
          selected={picked.includes(choice.id)}
          onPress={() => toggle(choice.id)}
        />
      ))}
      <OptionCard
        multi
        emoji="✨"
        title={t("onboardingQ.goalEverything")}
        selected={everything}
        onPress={() => onChange(everything ? [] : [...GOALS])}
      />
    </QuestionScreen>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(1.5),
  },
  scroll: {
    flex: 1,
  },
  body: {
    gap: theme.gap(3),
    paddingBottom: theme.gap(2),
  },
  list: {
    gap: theme.gap(1.25),
  },
}));
