import { t, useAppLocale } from "@/lib/i18n";
import { EmptyState } from "@/components/empty-state";
import { SaveHowTo } from "@/components/home/save-how-to";
import { SaveRecallCard } from "@/components/home/save-recall-card";
import { WeeklyNudgeSheet } from "@/components/home/weekly-nudge-sheet";
import { CancelSurveyCard } from "@/components/cancel-survey/cancel-survey-card";
import { FeedbackInvitation } from "@/components/feedback/feedback-invitation";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { ShelfRow, type ShelfCard } from "@/components/shelf/shelf-row";
import { Display, Eyebrow, Gutter } from "@/components/shelf/typography";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Wordmark } from "@/components/wordmark";
import { useCurrentUser } from "@/lib/current-user";
import { usePaywallGuard } from "@/lib/entitlement";
import { hasSavedFirstShare, shouldShowHowTo } from "@/lib/first-share";
import { useHomeFeed } from "@/lib/home-feed";
import { groupIntoShelves, type ShelfSection } from "@/lib/home-shelves";
import { saveMark } from "@/lib/ink/save-mark";
import { useInkClock } from "@/lib/ink/use-ink-clock";
import {
  useBusySaving,
  useFeedbackInvitation,
} from "@/lib/feedback-invitation";
import { useCancelSurvey } from "@/lib/use-cancel-survey";
import { useReviewPrompt } from "@/lib/review-prompt";
import { useSaveRecall } from "@/lib/use-save-recall";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { PropKind } from "@/lib/ink/strokes";

const SECTION_LABEL: Record<
  ShelfSection,
  "home.sectionNew" | "home.sectionEarlier"
> = {
  new: "home.sectionNew",
  earlier: "home.sectionEarlier",
};

/** At most one prop per shelf, and a different one per row so a screen of
 * shelves does not repeat itself. */
const SHELF_PROPS: readonly PropKind[] = ["mug", "plant"];

export default function HomeScreen() {
  useAppLocale();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { items, loadMore, canLoadMore } = useHomeFeed();
  useReviewPrompt(items);

  // One clock for the screen: the hairline, the shelves and every mark on
  // them draw from it, so the page reads as one hand working down it.
  const clock = useInkClock();

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
  const { guard, loading: entitlementLoading } = usePaywallGuard("home");

  // The share screen records the first save while Home stays mounted below
  // it, so re-read the flag on focus.
  const [, setFocusCount] = useState(0);
  useFocusEffect(useCallback(() => setFocusCount((n) => n + 1), []));
  const firstShareSaved = user ? hasSavedFirstShare(user._id) : true;

  // Read once per mount: the week boundary must not move under the user
  // mid-scroll, and a shelf's name would otherwise change as they read it.
  const [openedAt] = useState(() => Date.now());
  const shelves = useMemo(
    () => groupIntoShelves(items ?? [], openedAt),
    [items, openedAt],
  );

  const header = (
    <ScreenHeader
      clock={clock}
      center={<Wordmark size={26} />}
      left={
        <HeaderIconButton
          icon="person.fill"
          label={t("navigation.profile")}
          onPress={() => router.push("/profile")}
          testID="open-profile"
        />
      }
      right={
        <HeaderIconButton
          icon="plus"
          label={t("capture.add")}
          disabled={entitlementLoading}
          onPress={() => void guard(() => router.push("/add"))}
          testID="open-add"
        />
      }
    />
  );

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
    return (
      <View style={styles.container}>
        {header}
        <ScreenLoader label={t("loading.home")} />
      </View>
    );
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
        {header}
        {showHowTo ? (
          <ScrollView contentContainerStyle={styles.howToOnly}>
            <SaveHowTo />
          </ScrollView>
        ) : (
          <EmptyState
            title={t("home.emptyTitle")}
            message={t("home.emptyBody")}
          />
        )}
        {cancelSurveyCard}
        {nudge}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Gutter style={styles.headline}>
          <Display>{t("home.headline", { count: items.length })}</Display>
        </Gutter>

        {cancelSurveyCard ??
          (showHowTo ? (
            <Gutter style={styles.howToHeader}>
              <SaveHowTo />
            </Gutter>
          ) : recall.visible ? (
            <Gutter style={styles.howToHeader}>
              <SaveRecallCard
                matches={recall.matches}
                onOpen={recall.opened}
                onDismiss={recall.dismiss}
              />
            </Gutter>
          ) : feedback.invitationVisible && !busySaving ? (
            <FeedbackInvitation
              onSendFeedback={feedback.openFeedbackFromInvitation}
              onDismiss={feedback.dismissInvitation}
            />
          ) : null)}

        {shelves.map((shelf, index) => (
          <View key={shelf.section} style={styles.shelf}>
            <Gutter>
              <Eyebrow>{`${t(SECTION_LABEL[shelf.section])} · ${shelf.items.length}`}</Eyebrow>
            </Gutter>
            <ShelfRow
              width={width}
              clock={clock}
              seed={index}
              prop={SHELF_PROPS[index % SHELF_PROPS.length]}
              // Older pages land on the last shelf, which grows sideways, so
              // that row's end is where the feed asks for more.
              onEndReached={
                canLoadMore && index === shelves.length - 1
                  ? loadMore
                  : undefined
              }
              testID={`shelf-${shelf.section}`}
              cards={shelf.items.map<ShelfCard>((item) => ({
                key: item._id,
                imageUrl: item.imageUrl ?? item.heroImageUrl,
                title: item.title ?? item.note,
                note: item.type === "note",
                mark: saveMark(item),
                aspectRatio: item.aspectRatio,
                accessibilityLabel: item.title ?? item.note,
                testID: item.fixtureKey
                  ? `fixture-item-${item.fixtureKey}`
                  : undefined,
                onPress: () =>
                  router.push({
                    pathname: "/item/[id]",
                    params: { id: item._id, from: "home" },
                  }),
              }))}
            />
          </View>
        ))}
      </ScrollView>
      {nudge}
      {feedback.modalOpen ? (
        <FeedbackModal surface="home" onClose={feedback.closeFeedback} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: { flex: 1, backgroundColor: theme.colors.background },
  content: { paddingBottom: 24 },
  headline: { paddingTop: 20, paddingBottom: 24 },
  howToOnly: { padding: theme.gap(2) },
  howToHeader: { paddingBottom: theme.gap(2) },
  // Shelf rows sit 14 apart.
  shelf: { marginBottom: 14, gap: 8 },
}));
