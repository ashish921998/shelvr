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
import { type ReactNode, useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** The weekly sheet is modal, so it waits while any inline prompt is up. */
function nudgeSheetReady(
  nudgeReady: boolean,
  ...inlinePromptsVisible: boolean[]
) {
  return nudgeReady && !inlinePromptsVisible.some(Boolean);
}

/** Prompts after the recall card wait while it, or anything before it, holds
 * or may claim the Home moment. */
function laterPromptsDeferred(
  progress: { deferLater: boolean },
  recall: { visible: boolean; pending: boolean },
): boolean {
  return progress.deferLater || recall.visible || recall.pending;
}

/**
 * The rating prompt joins Home's moment chain last: it waits while anything
 * earlier holds or may claim the slot (cancel survey, Pro card, welcome,
 * save progress, recall, feedback invitation or form). It also sits out an
 * account's first session and a weekly sheet that may rise. Through the Pro
 * card it also skips locked and lapsed accounts on purpose: someone who
 * can't save right now is the wrong person to ask for a rating. Lifting a
 * hold restarts the prompt's settle window, which covers a sheet's dismissal.
 */
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
    // Mirrors when HomeSheets can raise the nudge, so a nudge held back
    // for the rest of the visit does not hold the prompt back with it.
    (nudgePending && progress.nudgeReady && !welcomeSeen)
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

/** The welcome hands off to Add as it closes, so the weekly nudge sits out
 * the rest of this visit instead of rising in the gap. */
function useWelcomeSeen(userId: string | undefined): boolean {
  const welcomePending = welcomeSave.usePending(userId);
  // Keyed to the account: Home stays mounted across a sign-out, and the next
  // account's nudge must not inherit this one's welcome.
  const [seenFor, setSeenFor] = useState<string | null>(null);
  if (welcomePending && userId && seenFor !== userId) setSeenFor(userId);
  return userId !== undefined && seenFor === userId;
}

/** Home's modal prompts. Pro just started: one real save comes first. */
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
        {emptyFeedStarter(proCard, showHowTo, progressCard) ?? (
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
          progressCard ??
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

/** The save progress card covers sharing too, so it replaces the share
 * how-to while it is up. The how-to waits for the count, so it never
 * flashes before the card. */
function howToVisible(
  progress: ReturnType<typeof useSaveProgress>,
  firstShareSaved: boolean,
  itemCount: number,
): boolean {
  return (
    progress.card === null &&
    !progress.pending &&
    shouldShowHowTo({ firstShareSaved, itemCount })
  );
}

/** What an empty feed shows above everything else, if anything: the Pro
 * card, the share how-to, or the save progress card. */
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
    <ScrollView contentInsetAdjustmentBehavior="automatic">
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
