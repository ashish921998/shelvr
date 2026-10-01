import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { ExitOfferCard } from "@/components/home/exit-offer-card";
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
import { ScreenLoader } from "@/components/ui/screen-loader";
import { useCurrentUser } from "@/lib/current-user";
import {
  type Entitlement,
  useEntitlement,
  useExitOfferEndsAt,
} from "@/lib/entitlement";
import {
  hasSavedFirstShare,
  shouldShowHowTo,
  weeklyNudge,
} from "@/lib/first-share";
import { useHomeFeed } from "@/lib/home-feed";
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
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** The weekly sheet is modal, so it waits while any inline prompt is up. */
function nudgeSheetReady(
  nudgeReady: boolean,
  ...inlinePromptsVisible: boolean[]
) {
  return nudgeReady && !inlinePromptsVisible.some(Boolean);
}

/** No rating prompt in an account's first session, over the feedback form
 * (whose keyboard the review sheet would strand), or while Home's welcome or
 * weekly sheet may be up. Lifting the hold restarts the settle window, which
 * covers the sheet's dismissal. */
function useReviewDeferred(
  user: { _id: string } | null | undefined,
  progress: { firstSession: boolean; nudgeReady: boolean },
  feedbackOpen: boolean,
): boolean {
  const welcomePending = welcomeSave.usePending(user?._id);
  const nudgePending = weeklyNudge.usePending(user?._id);
  return (
    progress.firstSession ||
    feedbackOpen ||
    welcomePending ||
    (nudgePending && progress.nudgeReady)
  );
}

/** While the exit offer's window is open, its countdown takes the Pro slot. */
function ProSlot({ userId, lapsed }: { userId?: string; lapsed: boolean }) {
  const exitOfferEndsAt = useExitOfferEndsAt(userId);
  return exitOfferEndsAt !== null ? (
    <ExitOfferCard endsAt={exitOfferEndsAt} userId={userId} />
  ) : (
    <ProCard lapsed={lapsed} />
  );
}

/** The trial's real end date, only while the account is on a trial. */
function trialEnd(entitlement: Entitlement): number | undefined {
  return entitlement.status === "trialing" ? entitlement.expiresAt : undefined;
}

/**
 * Inline prompts (and the one-shot claims behind them) wait while the cancel
 * survey is up, while Pro is not yet known to be active, and while the
 * post-purchase welcome is queued, so none is spent behind that modal.
 */
function usePromptsDeferred(
  userId: string | undefined,
  surveyVisible: boolean,
  proPending: boolean,
): boolean {
  const welcomePending = welcomeSave.usePending(userId);
  return surveyVisible || proPending || welcomePending;
}

/** Home's modal prompts. Pro just started: one real save comes first. */
function HomeSheets({
  userId,
  entitled,
  trialEndsAt,
  surveyVisible,
  previewTitle,
  nudgeReady,
}: {
  userId: string;
  entitled: boolean;
  trialEndsAt?: number;
  surveyVisible: boolean;
  previewTitle?: string;
  nudgeReady: boolean;
}) {
  const welcomePending = welcomeSave.usePending(userId);
  // The welcome hands off to Add as it closes, so the weekly nudge sits out
  // the rest of this visit instead of rising in the gap.
  const [welcomeSeen, setWelcomeSeen] = useState(false);
  if (welcomePending && !welcomeSeen) setWelcomeSeen(true);
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
  // Saving is Pro-only. Without Pro (the paywall was closed, or Pro lapsed),
  // Home offers Pro instead of teaching a save that would only reopen it.
  // The Pro card owns the header, so the recall and feedback prompts defer
  // (and spend no one-shot claim) until entitlement is known and active.
  const entitlement = useEntitlement();
  const locked = !entitlement.loading && !entitlement.entitled;
  const proPending = entitlement.loading || locked;
  const { data: user } = useCurrentUser();
  // The cancel survey owns the Home moment when visible, then the save
  // progress card, then the save recall card. Each later prompt defers its
  // one-shot claim so it is never consumed behind a card that holds the slot.
  const progress = useSaveProgress(user?._id, {
    defer: usePromptsDeferred(user?._id, cancelSurvey.visible, proPending),
  });
  const recall = useSaveRecall(items, { defer: progress.deferLater });
  const feedback = useFeedbackInvitation(items, {
    defer: progress.deferLater || recall.visible || recall.pending,
  });
  useReviewPrompt(items, {
    defer: useReviewDeferred(user, progress, feedback.modalOpen),
  });
  const busySaving = useBusySaving(items);
  // The share screen records the first save while Home stays mounted below
  // it, so re-read the flag on focus.
  const [, setFocusCount] = useState(0);
  useFocusEffect(useCallback(() => setFocusCount((n) => n + 1), []));
  const firstShareSaved = user ? hasSavedFirstShare(user._id) : true;
  const proCard = locked ? (
    <ProSlot userId={user?._id} lapsed={entitlement.status === "lapsed"} />
  ) : null;

  // One element, two slots (empty feed and feed header) — the survey claims
  // the Home moment when both prompts are eligible.
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

  const showHowTo = shouldShowHowTo({
    firstShareSaved,
    itemCount: items.length,
  });
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
    />
  ) : null;

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        {proCard || showHowTo ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.howToOnly}
          >
            {proCard ?? <SaveHowTo />}
          </ScrollView>
        ) : (
          <EmptyState
            title={t("home.emptyTitle")}
            message={t("home.emptyBody")}
          />
        )}
        {/* A canceller with zero saves is exactly who the survey is for. */}
        {cancelSurveyCard}
        {nudge}
      </View>
    );
  }

  const recallCard = recall.visible ? (
    <SaveRecallCard
      matches={recall.matches}
      onOpen={recall.opened}
      onDismiss={recall.dismiss}
    />
  ) : null;

  const howToHeader =
    proCard || showHowTo ? (
      <View style={styles.howToHeader}>
        {proCard ?? <SaveHowTo />}
        <Text style={styles.shelfLabel}>{t("home.onYourShelf")}</Text>
      </View>
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
        // header on iOS and the invitation scrolls with the content. The
        // cancel survey claims the slot first, then the save progress card,
        // then the save recall card.
        ListHeaderComponent={
          cancelSurveyCard ??
          howToHeader ??
          saveProgressCard(progress) ??
          recallCard ??
          (feedback.invitationVisible && !busySaving ? (
            <FeedbackInvitation
              onSendFeedback={feedback.openFeedbackFromInvitation}
              onDismiss={feedback.dismissInvitation}
            />
          ) : undefined)
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

function saveProgressCard(progress: ReturnType<typeof useSaveProgress>) {
  return progress.card ? (
    <SaveProgressCard
      saved={progress.card.saved}
      goal={progress.card.goal}
      onDismiss={progress.dismiss}
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
}));
