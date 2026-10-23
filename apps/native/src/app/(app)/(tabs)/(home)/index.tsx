import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { ProCard } from "@/components/home/pro-card";
import { SaveHowTo } from "@/components/home/save-how-to";
import { SaveProgressCard } from "@/components/home/save-progress-card";
import { SaveRecallCard } from "@/components/home/save-recall-card";
import { WeeklyNudgeSheet } from "@/components/home/weekly-nudge-sheet";
import { WelcomeSaveSheet } from "@/components/home/welcome-save-sheet";
import { MasonryFeed } from "@/components/masonry-feed";
import { CancelSurveyCard } from "@/components/cancel-survey/cancel-survey-card";
import { FeedbackInvitation } from "@/components/feedback/feedback-invitation";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { DateTripHome } from "@/components/home/date-trip-home";
import { NextUpCard } from "@/components/home/next-up-card";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { useCurrentUser } from "@/lib/current-user";
import { type Entitlement, useEntitlement } from "@/lib/entitlement";
import {
  hasSavedFirstShare,
  shouldShowHowTo,
  weeklyNudge,
} from "@/lib/first-share";
import { useHomeFeed } from "@/lib/home-feed";
import { useNextUp } from "@/lib/next-up";
import {
  useBusySaving,
  useFeedbackInvitation,
} from "@/lib/feedback-invitation";
import { useCancelSurvey } from "@/lib/use-cancel-survey";
import { useReviewPrompt } from "@/lib/review-prompt";
import { useSaveProgress } from "@/lib/use-save-progress";
import { useSaveRecall } from "@/lib/use-save-recall";
import { HeaderScrim } from "@/components/ui/header-scrim";
import { welcomeSave } from "@/lib/welcome-save";
import { useFocusEffect } from "expo-router";
import {
  type ReactElement,
  type ReactNode,
  useCallback,
  useState,
} from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function nudgeSheetReady(
  nudgeReady: boolean,
  ...inlinePromptsVisible: boolean[]
) {
  return nudgeReady && !inlinePromptsVisible.some(Boolean);
}

function laterPromptsDeferred(
  progress: { deferLater: boolean },
  recall: { visible: boolean; pending: boolean },
): boolean {
  return progress.deferLater || recall.visible || recall.pending;
}

function useReviewDeferred(
  userId: string | undefined,
  laterDeferred: boolean,
  progress: { firstSession: boolean; nudgeReady: boolean },
  feedback: { invitationVisible: boolean; modalOpen: boolean },
  welcomeSeen: boolean,
): boolean {
  const nudgePending = weeklyNudge.usePending(userId);
  return (
    laterDeferred ||
    progress.firstSession ||
    feedback.invitationVisible ||
    feedback.modalOpen ||
    (nudgePending && progress.nudgeReady && !welcomeSeen)
  );
}

function trialEnd(entitlement: Entitlement): number | undefined {
  return entitlement.status === "trialing" ? entitlement.expiresAt : undefined;
}

function usePromptsDeferred(
  userId: string | undefined,
  surveyVisible: boolean,
  proPending: boolean,
): boolean {
  const welcomePending = welcomeSave.usePending(userId);
  return surveyVisible || proPending || welcomePending;
}

function useWelcomeSeen(userId: string | undefined): boolean {
  const welcomePending = welcomeSave.usePending(userId);
  const [seenFor, setSeenFor] = useState<string | null>(null);
  if (welcomePending && userId && seenFor !== userId) setSeenFor(userId);
  return userId !== undefined && seenFor === userId;
}

function HomeSheets({
  userId,
  entitled,
  trialEndsAt,
  surveyVisible,
  previewTitle,
  nudgeReady,
  welcomeSeen,
}: {
  userId: string;
  entitled: boolean;
  trialEndsAt?: number;
  surveyVisible: boolean;
  previewTitle?: string;
  nudgeReady: boolean;
  welcomeSeen: boolean;
}) {
  return (
    <>
      <WelcomeSaveSheet
        userId={userId}
        ready={entitled && !surveyVisible}
        trialEndsAt={trialEndsAt}
      />
      <WeeklyNudgeSheet
        userId={userId}
        previewTitle={previewTitle}
        ready={nudgeReady && !welcomeSeen}
      />
    </>
  );
}

export default function HomeScreen() {
  useAppLocale();
  const { items, canLoadMore, loadingMore, loadMore } = useHomeFeed();

  const cancelSurvey = useCancelSurvey();
  const entitlement = useEntitlement();
  const locked = !entitlement.loading && !entitlement.entitled;
  const proPending = entitlement.loading || locked;
  const { data: user } = useCurrentUser();
  const progress = useSaveProgress(user?._id, {
    defer: usePromptsDeferred(user?._id, cancelSurvey.visible, proPending),
  });
  const recall = useSaveRecall(items, { defer: progress.deferLater });
  const laterDeferred = laterPromptsDeferred(progress, recall);
  const welcomeSeen = useWelcomeSeen(user?._id);
  const feedback = useFeedbackInvitation(items, { defer: laterDeferred });
  useReviewPrompt(items, {
    defer: useReviewDeferred(
      user?._id,
      laterDeferred,
      progress,
      feedback,
      welcomeSeen,
    ),
  });
  const busySaving = useBusySaving(items);
  const nextUp = useNextUp(user?._id, entitlement.entitled);
  const [, setFocusCount] = useState(0);
  useFocusEffect(useCallback(() => setFocusCount((n) => n + 1), []));
  const firstShareSaved = user ? hasSavedFirstShare(user._id) : true;
  const proCard = locked ? (
    <ProCard lapsed={entitlement.status === "lapsed"} />
  ) : null;

  const cancelSurveyCard = cancelSurvey.visible ? (
    <CancelSurveyCard
      onPresented={cancelSurvey.presented}
      onSubmit={(reason) =>
        cancelSurvey.finish({ outcome: "submitted", reason })
      }
      onDismiss={() => cancelSurvey.finish({ outcome: "dismissed" })}
    />
  ) : null;

  if (items === undefined) {
    return <ScreenLoader label={t("loading.home")} />;
  }

  const progressCard = saveProgressCard(progress);
  const showHowTo = howToVisible(progress, firstShareSaved, items.length);
  const nudge = user ? (
    <HomeSheets
      userId={user._id}
      entitled={entitlement.entitled}
      trialEndsAt={trialEnd(entitlement)}
      surveyVisible={cancelSurvey.visible}
      previewTitle={items[0]?.title}
      nudgeReady={nudgeSheetReady(
        progress.nudgeReady,
        cancelSurvey.visible,
        recall.visible,
        feedback.invitationVisible,
      )}
      welcomeSeen={welcomeSeen}
    />
  ) : null;

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        {emptyFeedStarter(proCard, showHowTo, progressCard) ??
          (progress.pending ? null : (
            <EmptyState
              title={t("home.emptyTitle")}
              message={t("home.emptyBody")}
            />
          ))}
        {cancelSurveyCard}
        {nudge}
      </View>
    );
  }

  const recallCard = recall.visible ? (
    <SaveRecallCard
      savedTitle={recall.saved?.title}
      matches={recall.matches}
      onOpen={recall.opened}
      onDismiss={recall.dismiss}
    />
  ) : null;

  const nextUpCard = nextUp.next ? (
    <NextUpCard
      next={nextUp.next}
      onShown={nextUp.shown}
      onOpen={nextUp.opened}
      onDismiss={nextUp.dismiss}
    />
  ) : undefined;

  const howToHeader =
    proCard || showHowTo ? (
      <View style={styles.howToHeader}>{proCard ?? <SaveHowTo />}</View>
    ) : null;

  return (
    <View style={styles.container}>
      <MasonryFeed
        items={items}
        numColumns={2}
        source={{ from: "home" }}
        onEndReached={canLoadMore ? loadMore : undefined}
        loadingMore={loadingMore}
        // Inside the feed so contentInsetAdjustmentBehavior clears the blur
        // header on iOS.
        ListHeaderComponent={
          <View>
            <DateTripHome />
            {cancelSurveyCard ??
              howToHeader ??
              progressCard ??
              recallCard ??
              lastHeader(feedback, busySaving, nextUpCard)}
            <Text style={[styles.shelfLabel, styles.feedLabel]}>
              {t("homePlans.everythingSaved")}
            </Text>
          </View>
        }
      />
      <HeaderScrim />
      {nudge}
      {feedback.modalOpen ? (
        <FeedbackModal surface="home" onClose={feedback.closeFeedback} />
      ) : null}
    </View>
  );
}

function lastHeader(
  feedback: ReturnType<typeof useFeedbackInvitation>,
  busySaving: boolean,
  nextUpCard: ReactElement | undefined,
): ReactElement | undefined {
  if (feedback.invitationVisible && !busySaving) {
    return (
      <FeedbackInvitation
        onSendFeedback={feedback.openFeedbackFromInvitation}
        onDismiss={feedback.dismissInvitation}
      />
    );
  }
  return nextUpCard;
}

function howToVisible(
  progress: ReturnType<typeof useSaveProgress>,
  firstShareSaved: boolean,
  itemCount: number,
): boolean {
  return (
    !progress.deferLater && shouldShowHowTo({ firstShareSaved, itemCount })
  );
}

function emptyFeedStarter(
  proCard: ReactNode,
  showHowTo: boolean,
  progressCard: ReactNode,
): ReactNode {
  if (proCard || showHowTo) {
    return (
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.howToOnly}
      >
        {proCard ?? <SaveHowTo />}
      </ScrollView>
    );
  }
  if (!progressCard) return null;
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.progressOnly}
    >
      {progressCard}
    </ScrollView>
  );
}

function saveProgressCard(progress: ReturnType<typeof useSaveProgress>) {
  return progress.card ? (
    <SaveProgressCard
      saved={progress.card.saved}
      goal={progress.card.goal}
      onDismiss={progress.dismiss}
      onShown={progress.markShown}
    />
  ) : null;
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  howToOnly: {
    padding: theme.gap(2),
  },
  progressOnly: {
    paddingVertical: theme.gap(1),
  },
  howToHeader: {
    gap: theme.gap(2.5),
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1.5),
  },
  shelfLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.faint,
  },
  feedLabel: {
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(1),
  },
}));
