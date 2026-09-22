import { useState, type ReactNode } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { TERMS_VERSION } from "@convex/model/legalConsent";
import { t, useAppLocale } from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import { analytics } from "@/lib/analytics";
import { useOnboarding } from "@/lib/onboarding";
import { ScreenLoader } from "@/components/ui/screen-loader";

/** Review follows sign-in/onboarding, before purchase UI can be presented. */
export function LegalConsentBoundary({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { onboarded } = useOnboarding();
  const enabled = isAuthenticated && onboarded && Platform.OS === "ios";
  const consent = useQuery(api.legalConsent.get, enabled ? {} : "skip");
  if (isLoading) return <ScreenLoader label={t("loading.app")} />;
  if (!enabled) return children;
  if (consent === undefined) return <ScreenLoader label={t("loading.app")} />;
  if (consent?.reviewedVersion !== TERMS_VERSION) return <LegalConsentReview />;
  return children;
}

function LegalConsentReview({ onComplete }: { onComplete?: () => void }) {
  useAppLocale();
  const review = useMutation(api.legalConsent.review);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const save = async (accepted: boolean) => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await review({ version: TERMS_VERSION, accepted });
      onComplete?.();
    } catch {
      analytics.captureError(
        "legal_consent_save_failed",
        new Error("legal_consent_save_failed"),
      );
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  return (
    <ScrollView contentContainerStyle={styles.review}>
      <Text accessibilityRole="header" style={styles.title}>
        {t("refundConsent.title")}
      </Text>
      <Text style={styles.body}>{t("refundConsent.disclosure")}</Text>
      <Text style={styles.body}>{t("refundConsent.optional")}</Text>
      <View style={styles.links}>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(LEGAL_URLS.terms)}
        >
          <Text style={styles.link}>{t("legal.terms")}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => void Linking.openURL(LEGAL_URLS.privacy)}
        >
          <Text style={styles.link}>{t("legal.privacy")}</Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        disabled={pending}
        onPress={() => void save(true)}
        style={styles.primary}
      >
        <Text style={styles.primaryLabel}>{t("refundConsent.accept")}</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        disabled={pending}
        onPress={() => void save(false)}
        style={styles.secondary}
      >
        <Text style={styles.link}>{t("refundConsent.later")}</Text>
      </Pressable>
      {failed ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t("refundConsent.error")}
        </Text>
      ) : null}
    </ScrollView>
  );
}

export function LegalConsentPreference() {
  useAppLocale();
  const enabled = Platform.OS === "ios";
  const consent = useQuery(api.legalConsent.get, enabled ? {} : "skip");
  const withdraw = useMutation(api.legalConsent.withdraw);
  const [reviewing, setReviewing] = useState(false);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!enabled) return null;
  const turnOff = async () => {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      await withdraw({});
    } catch {
      analytics.captureError(
        "refund_consent_withdraw_failed",
        new Error("refund_consent_withdraw_failed"),
      );
      setFailed(true);
    } finally {
      setPending(false);
    }
  };
  if (reviewing)
    return <LegalConsentReview onComplete={() => setReviewing(false)} />;
  return (
    <View style={styles.preference}>
      <Text style={styles.heading}>{t("refundConsent.setting")}</Text>
      <Text style={styles.body}>
        {t(
          consent?.refundSharing
            ? "refundConsent.enabled"
            : "refundConsent.disabled",
        )}
      </Text>
      {consent?.syncPending ? (
        <Text style={styles.body}>{t("refundConsent.syncPending")}</Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={pending || consent === undefined}
        style={styles.secondary}
        onPress={() =>
          consent?.refundSharing ? void turnOff() : setReviewing(true)
        }
      >
        <Text style={styles.link}>
          {t(
            consent?.refundSharing
              ? "refundConsent.withdraw"
              : "refundConsent.review",
          )}
        </Text>
      </Pressable>
      {failed ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {t("refundConsent.error")}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  review: {
    flexGrow: 1,
    justifyContent: "center",
    padding: theme.gap(3),
    paddingTop: rt.insets.top + theme.gap(3),
    paddingBottom: rt.insets.bottom + theme.gap(3),
    gap: theme.gap(2),
    backgroundColor: theme.colors.background,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    color: theme.colors.foreground,
  },
  heading: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  body: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 22,
    color: theme.colors.muted,
  },
  link: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.primaryText,
    textDecorationLine: "underline",
  },
  links: { gap: theme.gap(2), paddingVertical: theme.gap(1) },
  primary: {
    minHeight: 48,
    padding: theme.gap(2),
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.foreground,
  },
  primaryLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.background,
  },
  secondary: {
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
    padding: theme.gap(1),
  },
  preference: { padding: theme.gap(2), gap: theme.gap(1) },
  error: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.danger,
  },
}));
