import { useEffect, useState } from "react";
import { t, useAppLocale } from "@/lib/i18n";
import { FreeSavesCard, ProCard } from "@/components/home/pro-card";
import { HomeHeader } from "@/components/home/home-header";
import { HomeSearch } from "@/components/home/home-search";
import { RecentSaves } from "@/components/home/recent-saves";
import { CancelSurveyCard } from "@/components/cancel-survey/cancel-survey-card";
import { FeedbackInvitation } from "@/components/feedback/feedback-invitation";
import { HomePlaces, HomePlacesEmptyCard } from "@/components/home/home-places";
import { LibraryRows } from "@/components/home/library-rows";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { useOneTimePrompts } from "@/components/one-time-prompts";
import { useEntitlement } from "@/lib/entitlement";
import { FREE_SAVES_NUDGE_AT } from "@/lib/access";
import { useAccess } from "@/lib/free-plan";
import { useHomeFeed } from "@/lib/home-feed";
import { unplacedSaves } from "@/lib/home-places";
import { useBusySaving } from "@/lib/feedback-invitation";
import { useSheetTurnUp } from "@/lib/one-time-sheets";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  ScrollView,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// Older saves with no place sit past the first feed page, so Home pages on like a list would.
const LOAD_MORE_DISTANCE = 600;
// Unasked, Home only pages until it has a screenful of unplaced saves, and never past this many saves; scrolling loads the rest.
const AUTO_LOAD_SAVES = 200;
const AUTO_LOAD_UNPLACED = 5;

export default function HomeScreen() {
  useAppLocale();
  const { theme } = useUnistyles();
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
  const { cancelSurvey, feedback } = useOneTimePrompts();
  const entitlement = useEntitlement();
  const access = useAccess();
  const locked = access.kind === "locked";
  const nearLimit =
    access.kind === "free" && access.left <= FREE_SAVES_NUDGE_AT;
  const sheetUp = useSheetTurnUp();
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
  ) : feedback.invitationVisible && !busySaving && !sheetUp ? (
    <FeedbackInvitation
      onSendFeedback={feedback.openFeedbackFromInvitation}
      onDismiss={feedback.dismissInvitation}
    />
  ) : null;
  const top = topCard ? <View style={styles.topCard}>{topCard}</View> : null;

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingBottom: theme.gap(2) }}
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
        {locked ? (
          <>
            <HomeHeader />
            {top}
          </>
        ) : (
          <HomeSearch top={top}>
            {items.length > 0 ? (
              <>
                <HomePlaces saves={items} />
                <RecentSaves saves={items} />
              </>
            ) : (
              <>
                <View style={styles.rows}>
                  <LibraryRows />
                </View>
                <View style={styles.empty}>
                  <HomePlacesEmptyCard />
                </View>
              </>
            )}
          </HomeSearch>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  container: {
    flex: 1,
    paddingTop: rt.insets.top,
  },
  topCard: {
    paddingHorizontal: theme.gap(2),
    paddingBottom: theme.gap(1.5),
  },
  rows: { paddingHorizontal: theme.gap(2.5) },
  empty: {
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(3),
  },
}));
