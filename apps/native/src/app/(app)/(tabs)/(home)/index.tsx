import { useEffect, useState } from "react";
import { t, useAppLocale } from "@/lib/i18n";
import { FreeSavesCard, ProCard } from "@/components/home/pro-card";
import { HomeSearch } from "@/components/home/home-search";
import { SharedListsSection } from "@/components/home/shared-lists-section";
import { WelcomeSaveSheet } from "@/components/home/welcome-save-sheet";
import { CancelSurveyCard } from "@/components/cancel-survey/cancel-survey-card";
import { FeedbackInvitation } from "@/components/feedback/feedback-invitation";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import {
  HomePlaces,
  HomePlacesEmptyCard,
  UnplacedSaves,
} from "@/components/home/home-places";
import { ReviewSaves } from "@/components/home/review-saves";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { HeaderScrim } from "@/components/ui/header-scrim";
import { useCurrentUser } from "@/lib/current-user";
import { type Entitlement, useEntitlement } from "@/lib/entitlement";
import { FREE_SAVES_NUDGE_AT, saveWaiting } from "@/lib/access";
import { useAccess } from "@/lib/free-plan";
import { useHomeFeed } from "@/lib/home-feed";
import { unplacedSaves } from "@/lib/home-places";
import {
  useBusySaving,
  useFeedbackInvitation,
} from "@/lib/feedback-invitation";
import { useCancelSurvey } from "@/lib/use-cancel-survey";
import { useReviewPrompt } from "@/lib/review-prompt";
import { NameSheet } from "@/components/shared-list/name-sheet";
import { useHoldSheetTurns, useSheetTurnsBusy } from "@/lib/one-time-sheets";
import { useWelcomeName } from "@/lib/welcome-name";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

// Older saves with no place sit past the first feed page, so Home pages on like a list would.
const LOAD_MORE_DISTANCE = 600;
// Unasked, Home only pages until it has a screenful of unplaced saves, and never past this many saves; scrolling loads the rest.
const AUTO_LOAD_SAVES = 200;
const AUTO_LOAD_UNPLACED = 5;

function trialEnd(entitlement: Entitlement): number | undefined {
  return entitlement.status === "trialing" ? entitlement.expiresAt : undefined;
}

export default function HomeScreen() {
  useAppLocale();
  const { items, canLoadMore, loadingMore, loadMore } = useHomeFeed();
  const [viewportHeight, setViewportHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const shortOfScreen =
    viewportHeight > 0 && contentHeight < viewportHeight + LOAD_MORE_DISTANCE;
  const wantsMore =
    items !== undefined &&
    items.length < AUTO_LOAD_SAVES &&
    unplacedSaves(items).length < AUTO_LOAD_UNPLACED;
  useEffect(() => {
    if (shortOfScreen && wantsMore && canLoadMore && !loadingMore) loadMore();
    // items.length re-runs it after each page, while the booleans stay the same.
  }, [
    shortOfScreen,
    wantsMore,
    canLoadMore,
    loadingMore,
    loadMore,
    items?.length,
  ]);
  const cancelSurvey = useCancelSurvey();
  const entitlement = useEntitlement();
  const access = useAccess();
  const locked = access.kind === "locked";
  const nearLimit =
    access.kind === "free" && access.left <= FREE_SAVES_NUDGE_AT;
  const { data: user } = useCurrentUser();
  const welcomeName = useWelcomeName(
    user?._id,
    items !== undefined &&
      !cancelSurvey.visible &&
      !entitlement.loading &&
      !saveWaiting(access),
  );
  const sheetsBusy = useSheetTurnsBusy();
  const deferPrompts =
    cancelSurvey.visible ||
    entitlement.loading ||
    locked ||
    sheetsBusy ||
    welcomeName.pending;
  const feedback = useFeedbackInvitation(items, { defer: deferPrompts });
  useHoldSheetTurns(feedback.modalOpen);
  useReviewPrompt(items, {
    defer: deferPrompts || feedback.invitationVisible || feedback.modalOpen,
  });
  const busySaving = useBusySaving(items);

  if (items === undefined) {
    return <ScreenLoader label={t("loading.home")} />;
  }

  const topCard = cancelSurvey.visible ? (
    <CancelSurveyCard
      onPresented={cancelSurvey.presented}
      onSubmit={(reason) =>
        cancelSurvey.finish({ outcome: "submitted", reason })
      }
      onDismiss={() => cancelSurvey.finish({ outcome: "dismissed" })}
    />
  ) : locked ? (
    <ProCard lapsed={entitlement.status === "lapsed"} />
  ) : nearLimit ? (
    <FreeSavesCard left={access.left} limit={access.limit} open={access.open} />
  ) : feedback.invitationVisible && !busySaving ? (
    <FeedbackInvitation
      onSendFeedback={feedback.openFeedbackFromInvitation}
      onDismiss={feedback.dismissInvitation}
    />
  ) : null;

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        scrollEventThrottle={200}
        onLayout={(e) => setViewportHeight(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, height) => setContentHeight(height)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const { layoutMeasurement, contentOffset, contentSize } =
            e.nativeEvent;
          if (
            layoutMeasurement.height + contentOffset.y >=
            contentSize.height - LOAD_MORE_DISTANCE
          )
            loadMore();
        }}
      >
        {topCard ? <View style={styles.topCard}>{topCard}</View> : null}
        {locked ? null : (
          <HomeSearch>
            <SharedListsSection />
            {items.length > 0 ? (
              <>
                <HomePlaces />
                <UnplacedSaves saves={items} />
                <ReviewSaves saves={items} />
              </>
            ) : (
              <View style={styles.empty}>
                <HomePlacesEmptyCard />
              </View>
            )}
          </HomeSearch>
        )}
      </ScrollView>
      <HeaderScrim />
      {user ? (
        <WelcomeSaveSheet
          userId={user._id}
          ready={entitlement.entitled && !cancelSurvey.visible}
          trialEndsAt={trialEnd(entitlement)}
        />
      ) : null}
      <NameSheet
        visible={welcomeName.open}
        kind="welcome"
        onDone={welcomeName.close}
        onCancel={welcomeName.close}
      />
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
  content: {
    paddingTop: theme.gap(1),
    paddingBottom: theme.gap(6),
  },
  topCard: {
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1.5),
  },
  empty: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(4),
  },
}));
