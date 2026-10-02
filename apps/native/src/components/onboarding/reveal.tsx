import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import {
  openPaywall,
  useEntitlement,
  waitForSheetTransition,
} from "@/lib/entitlement";
import { DEMO_SAMPLES } from "@/lib/onboarding-demo";
import { useOAuthSignIn } from "@/lib/oauth-sign-in";
import { getOnboardingProgress } from "@/lib/pending-onboarding";
import {
  noteDeclinedDuringOnboarding,
  notePurchasedDuringOnboarding,
} from "@/lib/replay-onboarding";
import { ItemCard, type FeedItem } from "@/components/item-card";
import { NotificationPreview } from "@/components/notification-preview";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import {
  SampleCard,
  SignInButtons,
  type DemoSaved,
} from "@/components/onboarding/live-demo";
import { api } from "@convex/_generated/api";
import { demoErrorCode } from "@convex/model/demoErrors";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useConvexAuth, useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function RevealStep({
  saved,
  restored,
  onSaved,
  onContinue,
  onFinish,
}: {
  saved: DemoSaved | null;
  /** The app relaunched onto this step, so the paywall opens once by itself. */
  restored: boolean;
  onSaved: (saved: DemoSaved) => void;
  /** Pro is active: on to the share-sheet practice. */
  onContinue: () => void;
  /** Declined the paywall: straight to the app. */
  onFinish: () => void;
}) {
  useAppLocale();
  const router = useRouter();
  const { isAuthenticated } = useConvexAuth();
  const { entitled, status, loading: entitlementLoading } = useEntitlement();
  const createDemoItem = useMutation(api.demo.createDemoItem);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const attachRef = useRef(false);
  const autoPaywallRef = useRef(!restored);
  const [attaching, setAttaching] = useState(
    () => getOnboardingProgress().demo !== null,
  );

  const itemQuery = useQuery(
    convexQuery(
      api.items.getItem,
      saved === null ? "skip" : { id: saved.itemId },
    ),
  );
  const item = itemQuery.data;

  // After a relaunch only the persisted demo request survives. The server
  // returns the same item for a repeat request, so this re-attaches to it.
  useEffect(() => {
    if (saved !== null || !isAuthenticated || attachRef.current) return;
    const demo = getOnboardingProgress().demo;
    if (demo === null) return;
    attachRef.current = true;
    createDemoItem({
      url: demo.url,
      spaceName: demo.destination ?? undefined,
      analyticsSessionId: analytics.sessionId(),
    })
      .then((result) => {
        // A previewed sample is first saved here, after the reveal's sign-in.
        if (!result.reused) analytics.capture("onboarding_demo_submitted");
        onSaved({
          itemId: result.itemId,
          savedSpaceNames: result.savedSpaceNames,
        });
      })
      .catch((err: unknown) => {
        setAttaching(false);
        if (demoErrorCode(err) !== "demo_used") {
          analytics.captureError("onboarding_reveal_attach_failed", err);
        }
      });
  }, [saved, isAuthenticated, createDemoItem, onSaved]);

  const keepSaving = async () => {
    if (entitled) {
      onContinue();
      return;
    }
    setPaywallOpen(true);
    try {
      if (await openPaywall(router, "onboarding")) {
        notePurchasedDuringOnboarding();
        onContinue();
      }
    } finally {
      setPaywallOpen(false);
    }
  };

  const keepSavingRef = useRef(keepSaving);
  useEffect(() => {
    keepSavingRef.current = keepSaving;
  });

  useEffect(() => {
    if (autoPaywallRef.current || entitlementLoading || !isAuthenticated) {
      return;
    }
    autoPaywallRef.current = true;
    if (entitled) return;
    void waitForSheetTransition().then(() => keepSavingRef.current());
  }, [entitlementLoading, entitled, isAuthenticated]);

  const card: FeedItem | null = item
    ? {
        _id: item._id,
        type: item.type,
        status: item.status,
        title: item.title,
        url: item.url,
        siteName: item.siteName,
        heroImageUrl: item.heroImageUrl,
        imageUrl: item.imageUrl,
        aspectRatio: item.aspectRatio,
        enrichment: item.enrichment,
        tags: item.tags,
      }
    : null;
  // Signed out with a ready-made sample picked: the demo previewed it, so the
  // reveal shows the sample and asks for sign-in. Signing in saves it for real
  // through the attach effect above.
  const pending = attaching ? getOnboardingProgress().demo : null;
  const previewSample =
    isAuthenticated || pending === null
      ? undefined
      : DEMO_SAMPLES.find((sample) => sample.url === pending.url);
  const preview =
    previewSample === undefined
      ? null
      : { sample: previewSample, space: pending?.destination ?? null };

  // Skipped after a failed save, or the saved item was deleted since.
  const empty = item === null || (saved === null && !attaching);
  const space = empty ? undefined : saved?.savedSpaceNames[0];
  const previewTitle = item?.title;

  if (preview !== null) {
    return (
      <SamplePreview
        sample={preview.sample}
        space={preview.space}
        onNotNow={() => {
          analytics.capture("onboarding_signin_prompt", {
            surface: "reveal",
            action: "dismissed",
          });
          onFinish();
        }}
      />
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.verdict}>
        {t(empty ? "reveal.emptyTitle" : "reveal.title")}{" "}
        <Text style={styles.verdictMuted}>
          {t(empty ? "reveal.emptySubtitle" : "reveal.subtitle")}
        </Text>
      </Text>

      {card ? (
        <View pointerEvents="none">
          <ItemCard item={card} />
        </View>
      ) : null}

      {space ? (
        <View style={styles.dest}>
          <Text style={styles.destText}>{t("reveal.filedIn", { space })}</Text>
        </View>
      ) : null}

      <Text style={styles.support}>
        {item?.enrichment === "partial"
          ? t("demo.partial")
          : t(empty ? "reveal.emptyExplainer" : "reveal.explainer")}
      </Text>

      <View style={styles.sunday}>
        <Text style={styles.label}>{t("reveal.everySunday")}</Text>
        <NotificationPreview
          body={
            previewTitle
              ? t("weekly.previewBody", { title: previewTitle })
              : t("weekly.previewFallback")
          }
        />
      </View>

      <View style={styles.foot}>
        <CtaButton
          label={t(entitled ? "common.continue" : "reveal.keepSaving")}
          onPress={() => void keepSaving()}
          busy={paywallOpen || (entitlementLoading && isAuthenticated)}
        />
        {/* A lapsed account has used its trial, so only a first-time
            subscriber is told about one. */}
        {entitled || status === "lapsed" ? null : (
          <Text style={styles.trialNote}>{t("reveal.trialNote")}</Text>
        )}
        {entitled ? null : (
          <GhostButton
            label={t("common.notNow")}
            onPress={() => {
              noteDeclinedDuringOnboarding();
              onFinish();
            }}
            disabled={paywallOpen}
          />
        )}
      </View>
    </View>
  );
}

/** The signed-out reveal: the previewed sample, then "Save your shelf". */
function SamplePreview({
  sample,
  space,
  onNotNow,
}: {
  sample: (typeof DEMO_SAMPLES)[number];
  space: string | null;
  onNotNow: () => void;
}) {
  useAppLocale();
  const oauth = useOAuthSignIn("reveal");
  const busy = oauth.pendingProvider !== null;

  useEffect(() => {
    analytics.capture("onboarding_signin_prompt", {
      surface: "reveal",
      action: "shown",
    });
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.verdict}>
        {t("reveal.previewTitle")}{" "}
        <Text style={styles.verdictMuted}>{t("reveal.previewSubtitle")}</Text>
      </Text>

      <View pointerEvents="none">
        <SampleCard sample={sample} action="preview" disabled={false} />
      </View>

      {space ? (
        <View style={styles.dest}>
          <Text style={styles.destText}>{t("reveal.filedIn", { space })}</Text>
        </View>
      ) : null}

      <View style={styles.sunday}>
        <Text style={styles.label}>{t("reveal.everySunday")}</Text>
        <NotificationPreview
          body={t("weekly.previewBody", { title: sample.pageHeading })}
        />
      </View>

      <View style={styles.foot}>
        <Text style={styles.saveShelf}>{t("reveal.saveShelf")}</Text>
        <Text style={styles.support}>{t("demo.signInHelp")}</Text>
        <SignInButtons oauth={oauth} />
        <GhostButton
          label={t("common.notNow")}
          onPress={onNotNow}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  verdict: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  verdictMuted: {
    color: theme.colors.muted,
  },
  dest: {
    alignSelf: "flex-start",
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 50,
    backgroundColor: theme.colors.primarySoft,
  },
  destText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  sunday: {
    gap: theme.gap(1),
  },
  label: {
    fontFamily: theme.fonts.bold,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: theme.colors.faint,
  },
  trialNote: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
    color: theme.colors.muted,
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
  saveShelf: {
    fontFamily: theme.fonts.bold,
    fontSize: 20,
    lineHeight: 26,
    color: theme.colors.foreground,
  },
}));
