import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { MasonryFeed } from "@/components/masonry-feed";
import { CancelSurveyCard } from "@/components/cancel-survey/cancel-survey-card";
import { FeedbackInvitation } from "@/components/feedback/feedback-invitation";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { useHomeFeed } from "@/lib/home-feed";
import {
  useBusySaving,
  useFeedbackInvitation,
} from "@/lib/feedback-invitation";
import { useCancelSurvey } from "@/lib/use-cancel-survey";
import { useReviewPrompt } from "@/lib/review-prompt";
import { ProgressiveBlurHeader } from "progressive-blur";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function HomeScreen() {
  useAppLocale();
  const { items, canLoadMore, loadingMore, loadMore } = useHomeFeed();
  useReviewPrompt(items);

  const cancelSurvey = useCancelSurvey();
  // The cancel survey owns the Home moment when visible; defer the feedback
  // invitation's one-shot claim so it is never consumed behind the card.
  const feedback = useFeedbackInvitation(items, {
    defer: cancelSurvey.visible,
  });
  const busySaving = useBusySaving(items);

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

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title={t("home.emptyTitle")}
          message={t("home.emptyBody")}
        />
        {/* A canceller with zero saves is exactly who the survey is for. */}
        {cancelSurveyCard}
      </View>
    );
  }

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
        // cancel survey claims the slot when both are eligible.
        ListHeaderComponent={
          cancelSurveyCard ??
          (feedback.invitationVisible && !busySaving ? (
            <FeedbackInvitation
              onSendFeedback={feedback.openFeedbackFromInvitation}
              onDismiss={feedback.dismissInvitation}
            />
          ) : undefined)
        }
      />
      <ProgressiveBlurHeader />
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
}));
