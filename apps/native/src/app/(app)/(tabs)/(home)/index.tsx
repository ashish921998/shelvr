import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { MasonryFeed } from "@/components/masonry-feed";
import { FeedbackInvitation } from "@/components/feedback/feedback-invitation";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { useHomeFeed } from "@/lib/home-feed";
import {
  useBusySaving,
  useFeedbackInvitation,
} from "@/lib/feedback-invitation";
import { useReviewPrompt } from "@/lib/review-prompt";
import { ProgressiveBlurHeader } from "progressive-blur";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export default function HomeScreen() {
  useAppLocale();
  const { items, canLoadMore, loadingMore, loadMore } = useHomeFeed();
  useReviewPrompt(items);

  const feedback = useFeedbackInvitation(items);
  const busySaving = useBusySaving(items);

  if (items === undefined) {
    return <ScreenLoader label={t("Warming your shelf")} />;
  }

  if (items.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          title={t("Save it for later")}
          message={t(
            "Tap + to drop in a link, a photo, or a stray thought.\nShelvr keeps it warm until you need it.",
          )}
        />
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
        // header on iOS and the invitation scrolls with the content.
        ListHeaderComponent={
          feedback.invitationVisible && !busySaving ? (
            <FeedbackInvitation
              onSendFeedback={feedback.openFeedbackFromInvitation}
              onDismiss={feedback.dismissInvitation}
            />
          ) : undefined
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
