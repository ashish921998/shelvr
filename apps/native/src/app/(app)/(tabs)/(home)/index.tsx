import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { SaveHowTo } from "@/components/home/save-how-to";
import { SaveRecallCard } from "@/components/home/save-recall-card";
import { WeeklyNudgeSheet } from "@/components/home/weekly-nudge-sheet";
import { MasonryFeed } from "@/components/masonry-feed";
import { CancelSurveyCard } from "@/components/cancel-survey/cancel-survey-card";
import { FeedbackInvitation } from "@/components/feedback/feedback-invitation";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { useCurrentUser } from "@/lib/current-user";
import { hasSavedFirstShare, shouldShowHowTo } from "@/lib/first-share";
import { useHomeFeed } from "@/lib/home-feed";
import {
  useBusySaving,
  useFeedbackInvitation,
} from "@/lib/feedback-invitation";
import { useCancelSurvey } from "@/lib/use-cancel-survey";
import { useReviewPrompt } from "@/lib/review-prompt";
import { useSaveRecall } from "@/lib/use-save-recall";
import { ProgressiveBlurHeader } from "progressive-blur";
import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function HomeScreen() {
  useAppLocale();
  const { items, canLoadMore, loadingMore, loadMore } = useHomeFeed();
  useReviewPrompt(items);

  const cancelSurvey = useCancelSurvey();
  // The cancel survey owns the Home moment when visible, then the save recall
  // card. Each later prompt defers its one-shot claim so it is never consumed
  // behind a card that holds the slot.
  const recall = useSaveRecall(items, { defer: cancelSurvey.visible });
  const feedback = useFeedbackInvitation(items, {
    defer: cancelSurvey.visible || recall.visible || recall.pending,
  });
  const busySaving = useBusySaving(items);
  const { data: user } = useCurrentUser();
  // The share screen records the first save while Home stays mounted below
  // it, so re-read the flag on focus.
  const [, setFocusCount] = useState(0);
  useFocusEffect(useCallback(() => setFocusCount((n) => n + 1), []));
  const firstShareSaved = user ? hasSavedFirstShare(user._id) : true;

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
    <WeeklyNudgeSheet userId={user._id} previewTitle={items[0]?.title} />
  ) : null;

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        {showHowTo ? (
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={styles.howToOnly}
          >
            <SaveHowTo />
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

  const howToHeader = showHowTo ? (
    <View style={styles.howToHeader}>
      <SaveHowTo />
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
        // cancel survey claims the slot first, then the save recall card.
        ListHeaderComponent={
          cancelSurveyCard ??
          howToHeader ??
          recallCard ??
          (feedback.invitationVisible && !busySaving ? (
            <FeedbackInvitation
              onSendFeedback={feedback.openFeedbackFromInvitation}
              onDismiss={feedback.dismissInvitation}
            />
          ) : undefined)
        }
      />
      <ProgressiveBlurHeader />
      {nudge}
      {feedback.modalOpen ? (
        <FeedbackModal surface="home" onClose={feedback.closeFeedback} />
      ) : null}
    </View>
  );
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
