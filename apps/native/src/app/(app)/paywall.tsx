import { PaywallHeader, PrimaryButton } from "@/components/paywall/parts";
import { PlanStep, type PlanPrices } from "@/components/paywall/plan-step";
import { UnlockStep } from "@/components/paywall/unlock-step";
import { analytics } from "@/lib/analytics";
import {
  adoptPaywallRoute,
  loadPaywallOffer,
  purchasePaywallPackage,
  restorePurchases,
  type PaywallOffer,
} from "@/lib/entitlement";
import { formattingLocale, t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import {
  formatMoney,
  initialPaywallState,
  paywallReducer,
  perMonth,
  planCopy,
  savePct,
} from "@/lib/paywall-plans";
import type { RevenueCatPaywallResult } from "@/lib/paywall-result";
import {
  claimPaywallRequest,
  finishPaywall,
  subscribePaywallRequest,
  type PaywallRequest,
  type PurchaseOutcome,
} from "@/lib/paywall-session";
import { randomUUID } from "expo-crypto";
import { useNavigation, useRouter } from "expo-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  ReduceMotion,
  SlideInLeft,
  SlideInRight,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/**
 * Shelvr Pro paywall: what Pro unlocks (a carousel), then a plan picker with
 * the trial laid out day by day. Prices, trial eligibility, purchase and
 * restore come from RevenueCat; the layout is the app's own.
 * `lib/paywall-session.ts` explains how `openPaywall` waits on this screen.
 */

// The native stack's own transition events; expo-router's navigation type
// doesn't name them, and @react-navigation/native-stack isn't a direct
// dependency.
type StackNavigation = {
  addListener: (
    event: "transitionEnd",
    callback: (event: { data: { closing: boolean } }) => void,
  ) => () => void;
};

type Load =
  | { status: "loading" }
  | { status: "ready"; offer: PaywallOffer }
  | { status: "failed" };

const STORE_NAME = Platform.OS === "ios" ? "App Store" : "Google Play";

export default function PaywallScreen() {
  useAppLocale();
  const router = useRouter();
  const navigation = useNavigation() as unknown as StackNavigation;
  const insets = useSafeAreaInsets();
  const { theme } = useUnistyles();
  const [state, dispatch] = useReducer(paywallReducer, initialPaywallState);
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [busy, setBusy] = useState<"purchase" | "restore" | null>(null);
  // The date the timeline counts from; fixed while the screen is open.
  const [now] = useState(Date.now);
  // Steps slide in once the user moves between them, not on first paint.
  const [moved, setMoved] = useState(false);

  // The presentation this screen answers. Settled once, with the result
  // stored when the user acted, after the closing transition has ended.
  const owner = useRef<PaywallRequest | null>(null);
  const result = useRef<RevenueCatPaywallResult>("CANCELLED");
  const purchase = useRef<Promise<PurchaseOutcome> | null>(null);
  const standaloneAttempt = useRef<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    owner.current ??= claimPaywallRequest();
    if (owner.current) return;
    // Opened by a link or as a fallback: start a presentation of our own,
    // which claims nothing until adoption creates its request.
    const unsubscribe = subscribePaywallRequest(() => {
      if (!owner.current) owner.current = claimPaywallRequest("adopted");
    });
    adoptPaywallRoute("paywall_route");
    return unsubscribe;
  }, []);

  useEffect(() => {
    const settle = () => {
      const pending = purchase.current;
      const mine = owner.current;
      // A purchase in flight outlives the screen: report what it became.
      if (pending) {
        void pending.then((outcome) => {
          if (outcome === "purchased") finishPaywall("PURCHASED", mine);
          else if (mine) finishPaywall(result.current, mine);
        });
      } else if (mine) {
        // With no request, a purchase already recorded itself in `close`.
        finishPaywall(result.current, mine);
      }
    };
    mounted.current = true;
    const remove = navigation.addListener("transitionEnd", (event) => {
      if (event.data.closing) settle();
    });
    return () => {
      mounted.current = false;
      remove();
      // Recovery when no closing transition reported (Android back, a
      // replaced stack); a request already settled ignores this. Deferred,
      // so a development remount doesn't settle a screen still on view.
      setTimeout(() => {
        if (!mounted.current) settle();
      }, 0);
    };
  }, [navigation]);

  const fetchOffer = useCallback(() => {
    loadPaywallOffer()
      .then((offer) =>
        setLoad(offer ? { status: "ready", offer } : { status: "failed" }),
      )
      .catch(() => setLoad({ status: "failed" }));
  }, []);
  useEffect(fetchOffer, [fetchOffer]);
  const retry = () => {
    setLoad({ status: "loading" });
    fetchOffer();
  };

  const close = useCallback(
    (outcome: RevenueCatPaywallResult) => {
      // A purchase that resolves after the screen closed must not pop
      // whatever is underneath it.
      if (!mounted.current) return;
      result.current = outcome;
      if (!owner.current && (outcome === "PURCHASED" || outcome === "RESTORED"))
        finishPaywall(outcome, null);
      if (router.canGoBack()) router.back();
      else router.replace("/");
    },
    [router],
  );

  const autoplay = useCallback(() => dispatch({ type: "autoplay" }), []);
  const showSlide = useCallback(
    (slide: number) => dispatch({ type: "showSlide", slide }),
    [],
  );

  const offer = load.status === "ready" ? load.offer : null;
  const trial = offer?.trial ?? false;
  const prices = useMemo<PlanPrices | null>(() => {
    if (!offer) return null;
    const annual = offer.annual.product;
    const monthly = offer.monthly.product;
    return {
      annual: annual.priceString,
      monthly: monthly.priceString,
      perMonth: formatMoney(
        perMonth(annual.price),
        annual.currencyCode,
        formattingLocale(),
      ),
      savePct: savePct(annual.price, monthly.price),
    };
  }, [offer]);

  const buy = async () => {
    if (!offer || busy) return;
    const pkg = state.plan === "annual" ? offer.annual : offer.monthly;
    standaloneAttempt.current ??= randomUUID();
    analytics.capture("paywall_purchase_started", {
      placement: owner.current?.placement ?? "paywall_route",
      paywall_attempt_id: owner.current?.attemptId ?? standaloneAttempt.current,
      package_id: pkg.identifier,
    });
    setBusy("purchase");
    const pending = purchasePaywallPackage(pkg);
    purchase.current = pending;
    const outcome = await pending;
    purchase.current = null;
    setBusy(null);
    if (outcome === "purchased") close("PURCHASED");
    else if (outcome === "pending")
      Alert.alert(
        t("paywall.purchasePendingTitle"),
        t("paywall.purchasePendingBody"),
      );
    else if (outcome === "failed")
      Alert.alert(
        t("paywall.purchaseFailedTitle"),
        t("paywall.purchaseFailedBody"),
      );
  };

  const restore = async () => {
    if (busy) return;
    setBusy("restore");
    const outcome = await restorePurchases();
    setBusy(null);
    if (outcome === "restored") close("RESTORED");
    else if (outcome === "none")
      Alert.alert(
        t("pro.notFoundTitle"),
        t("pro.notFoundBody", { store: STORE_NAME }),
      );
    else
      Alert.alert(
        t("pro.restoreFailed"),
        t("pro.restoreFailedBody", { store: STORE_NAME }),
      );
  };

  const copy = planCopy(state.plan, trial, now);
  const stepEntering = moved
    ? (state.step === 1 ? SlideInRight : SlideInLeft)
        .duration(300)
        .reduceMotion(ReduceMotion.System)
    : undefined;

  return (
    <View
      style={[
        styles.screen,
        { paddingTop: Math.max(insets.top, theme.gap(2.5)) },
      ]}
    >
      <PaywallHeader
        step={state.step}
        onBack={() => {
          setMoved(true);
          dispatch({ type: "back" });
        }}
        onClose={() => close("CANCELLED")}
      />
      {load.status === "failed" ? (
        <View style={styles.center}>
          <Text style={styles.message}>{t("pro.loadFailed")}</Text>
          <PrimaryButton label={t("common.tryAgain")} onPress={retry} />
        </View>
      ) : state.step === 1 && !prices ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.colors.muted} />
        </View>
      ) : (
        <>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <Animated.View key={state.step} entering={stepEntering}>
              {state.step === 0 ? (
                <UnlockStep
                  slide={state.slide}
                  paused={state.paused}
                  onAutoplay={autoplay}
                  onShowSlide={showSlide}
                />
              ) : (
                <PlanStep
                  plan={state.plan}
                  trial={trial}
                  prices={prices!}
                  now={now}
                  onSelect={(plan) => dispatch({ type: "selectPlan", plan })}
                />
              )}
            </Animated.View>
          </ScrollView>
          <Animated.View
            entering={FadeIn.duration(theme.motion.duration.state)}
            style={[
              styles.footer,
              { paddingBottom: Math.max(insets.bottom, theme.gap(2)) },
            ]}
          >
            {state.step === 0 ? (
              <>
                <PrimaryButton
                  label={t("common.continue")}
                  onPress={() => {
                    setMoved(true);
                    dispatch({ type: "continue" });
                  }}
                />
                <Text style={styles.helper}>
                  {t(
                    trial
                      ? "paywall.unlockHelperTrial"
                      : "paywall.unlockHelper",
                  )}
                </Text>
              </>
            ) : (
              <>
                <PrimaryButton
                  label={t(copy.ctaKey)}
                  busy={busy === "purchase"}
                  disabled={!offer || busy !== null}
                  onPress={() => void buy()}
                />
                <Text style={styles.helper}>
                  {prices
                    ? t(copy.disclosureKey, {
                        price:
                          state.plan === "annual"
                            ? prices.annual
                            : prices.monthly,
                      })
                    : ""}
                </Text>
                <View style={styles.links}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy !== null}
                    onPress={() => void restore()}
                    hitSlop={8}
                  >
                    <Text style={styles.link}>{t("paywall.restore")}</Text>
                  </Pressable>
                  <View style={styles.dot} />
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
                    hitSlop={8}
                  >
                    <Text style={styles.link}>{t("legal.termsShort")}</Text>
                  </Pressable>
                  <View style={styles.dot} />
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
                    hitSlop={8}
                  >
                    <Text style={styles.link}>{t("legal.privacyShort")}</Text>
                  </Pressable>
                </View>
              </>
            )}
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors.background,
    paddingHorizontal: 20,
  },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  center: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "center",
    gap: theme.gap(2),
  },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.muted,
    textAlign: "center",
  },
  footer: { paddingTop: 16, gap: 10 },
  helper: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
    textAlign: "center",
  },
  links: {
    marginTop: 2,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 18,
  },
  link: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: theme.colors.faint,
  },
}));
