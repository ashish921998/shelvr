import { t, useAppLocale } from "@/lib/i18n";
import { ProCard } from "@/components/home/pro-card";
import { WelcomeSaveSheet } from "@/components/home/welcome-save-sheet";
import { CancelSurveyCard } from "@/components/cancel-survey/cancel-survey-card";
import { FeedbackInvitation } from "@/components/feedback/feedback-invitation";
import { FeedbackModal } from "@/components/feedback/feedback-modal";
import {
  HomePlaces,
  HomePlacesEmptyCard,
  UnplacedSaves,
} from "@/components/home/home-places";
import { ScreenLoader } from "@/components/ui/screen-loader";
import { HeaderScrim } from "@/components/ui/header-scrim";
import { useCurrentUser } from "@/lib/current-user";
import { type Entitlement, useEntitlement } from "@/lib/entitlement";
import { useHomeFeed } from "@/lib/home-feed";
import {
  useBusySaving,
  useFeedbackInvitation,
} from "@/lib/feedback-invitation";
import { useCancelSurvey } from "@/lib/use-cancel-survey";
import { useReviewPrompt } from "@/lib/review-prompt";
import { welcomeSave } from "@/lib/welcome-save";
import { ScrollView, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

function trialEnd(entitlement: Entitlement): number | undefined {
  return entitlement.status === "trialing" ? entitlement.expiresAt : undefined;
}

export default function HomeScreen() {
  useAppLocale();
  const { items } = useHomeFeed();
  const cancelSurvey = useCancelSurvey();
  const entitlement = useEntitlement();
  const locked = !entitlement.loading && !entitlement.entitled;
  const { data: user } = useCurrentUser();
  const welcomePending = welcomeSave.usePending(user?._id);
  const deferPrompts =
    cancelSurvey.visible || entitlement.loading || locked || welcomePending;
  const feedback = useFeedbackInvitation(items, { defer: deferPrompts });
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
  ) : feedback.invitationVisible && !busySaving ? (
    <FeedbackInvitation
      onSendFeedback={feedback.openFeedbackFromInvitation}
      onDismiss={feedback.dismissInvitation}
    />
  ) : null;

  return (
    <View style={styles.container}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {topCard ? <View style={styles.topCard}>{topCard}</View> : null}
        {items.length > 0 ? (
          <>
            <HomePlaces />
            <UnplacedSaves saves={items} />
          </>
        ) : locked ? null : (
          <View style={styles.empty}>
            <HomePlacesEmptyCard />
          </View>
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
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(4),
  },
}));
