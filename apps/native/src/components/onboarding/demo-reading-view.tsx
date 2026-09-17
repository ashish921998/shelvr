import type { TextMessageKey } from "@/locales/message-types";
import { t, useAppLocale } from "@/lib/i18n";
import { CtaButton, GhostButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { ActivityIndicator, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** The saved link, as the reading view and the sign-in sheet show it. */
export function DemoLinkRow({
  title,
  url,
  busy = false,
}: {
  title: string;
  url: string;
  busy?: boolean;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.linkRow}>
      <View style={styles.linkThumb}>
        <AppSymbolIcon name="link" size={18} tintColor={theme.colors.muted} />
      </View>
      <View style={styles.linkText}>
        <Text style={styles.linkHost} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.linkUrl} numberOfLines={1}>
          {url}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={theme.colors.primary} />
      ) : null}
    </View>
  );
}

/** The demo save after it reached the server: still reading, or failed. */
export function DemoReadingView({
  failed,
  terminal,
  host,
  url,
  timedOut,
  error,
  retrying,
  onRetry,
  onContinue,
  onKeepWaiting,
  onContinueWaiting,
}: {
  failed: boolean;
  /** The failure cannot change on retry. */
  terminal: boolean;
  host: string;
  url: string;
  timedOut: boolean;
  error: TextMessageKey | null;
  retrying: boolean;
  onRetry: () => void;
  onContinue: () => void;
  onKeepWaiting: () => void;
  onContinueWaiting: () => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <DemoLinkRow title={host} url={url} busy={!failed} />

      {failed ? (
        <View style={styles.head}>
          <Text style={styles.headline}>{t("demo.linkSaved")}</Text>
          <Text style={styles.support}>
            {terminal ? t("demo.notFoundHelp") : t("demo.processingFailed")}
          </Text>
        </View>
      ) : (
        <View style={[styles.head, styles.centered]}>
          <Text style={[styles.headline, styles.center]}>
            {timedOut ? t("demo.slow") : t("demo.reading")}
          </Text>
          <ReadingSteps />
          <Text style={[styles.support, styles.center]}>
            {timedOut ? t("demo.eitherWay") : t("demo.keepsGoing")}
          </Text>
        </View>
      )}

      {error === null ? null : <Text style={styles.error}>{t(error)}</Text>}

      <View style={styles.foot}>
        {failed ? (
          terminal ? (
            <CtaButton label={t("common.continue")} onPress={onContinue} />
          ) : (
            <>
              <CtaButton
                label={t("common.retry")}
                onPress={onRetry}
                busy={retrying}
              />
              <GhostButton label={t("common.continue")} onPress={onContinue} />
            </>
          )
        ) : timedOut ? (
          <>
            <CtaButton label={t("demo.keepWaiting")} onPress={onKeepWaiting} />
            <GhostButton
              label={t("demo.continueWaiting")}
              onPress={onContinueWaiting}
            />
          </>
        ) : null}
      </View>
    </View>
  );
}

const READING_STEPS: TextMessageKey[] = [
  "demo.stepSaved",
  "demo.stepReading",
  "demo.stepTitling",
  "demo.stepFiling",
];

function ReadingSteps() {
  const { theme } = useUnistyles();
  return (
    <View style={styles.steps}>
      {READING_STEPS.map((key, index) => (
        <View key={key} style={[styles.stepRow, index > 1 && styles.stepTodo]}>
          <View style={[styles.stepDot, index === 0 && styles.stepDotDone]}>
            {index === 0 ? (
              <AppSymbolIcon
                name="checkmark"
                size={10}
                tintColor={theme.colors.primaryForeground}
              />
            ) : index === 1 ? (
              <ActivityIndicator size="small" color={theme.colors.primary} />
            ) : null}
          </View>
          <Text style={[styles.stepText, index === 1 && styles.stepNow]}>
            {t(key)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  head: {
    gap: theme.gap(1),
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    gap: theme.gap(2.5),
  },
  center: {
    textAlign: "center",
  },
  headline: {
    fontFamily: theme.fonts.bold,
    fontSize: 26,
    lineHeight: 32,
    letterSpacing: -0.4,
    color: theme.colors.foreground,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  error: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.danger,
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    padding: theme.gap(1.25),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  linkThumb: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  linkText: {
    flex: 1,
    gap: 2,
  },
  linkHost: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  linkUrl: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.faint,
  },
  steps: {
    alignSelf: "center",
    gap: theme.gap(1.5),
  },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
  },
  stepTodo: {
    opacity: 0.4,
  },
  stepDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotDone: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  stepText: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  stepNow: {
    fontFamily: theme.fonts.bold,
  },
}));
