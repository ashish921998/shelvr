import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import {
  DEMO_SAMPLES,
  type DemoKind,
  type DemoSample,
} from "@/lib/onboarding-demo";
import type { PendingDemo } from "@/lib/pending-onboarding";
import { displayHost } from "@/lib/url";
import { useDemoSave, linkFromText, type DemoSaved } from "@/lib/use-demo-save";
import { useIncomingShareUrl } from "@/lib/use-incoming-share-url";
import { useOAuthSignIn, type OAuthProvider } from "@/lib/oauth-sign-in";
import {
  DemoLinkRow,
  DemoReadingView,
} from "@/components/onboarding/demo-reading-view";
import { GhostButton } from "@/components/onboarding/parts";
import { AppSymbolIcon } from "@/components/symbol";
import { isTerminalFailure } from "@convex/model/itemFields";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The first save is a pasted, typed or ready-made link; a link shared from
// another app still arrives through expo-sharing. The save pipeline lives in
// useDemoSave, share intake in useIncomingShareUrl.

export type { DemoSaved };

const APP_ICON = require("../../../assets/icon.png");
const SAMPLE_IMAGES: Record<DemoKind, number> = {
  Articles: require("../../../assets/onboarding/demo-article.jpg"),
  Recipes: require("../../../assets/onboarding/demo-recipe.jpg"),
  Products: require("../../../assets/onboarding/demo-product.jpg"),
  Travel: require("../../../assets/onboarding/demo-travel.jpg"),
};

export function LiveDemoStep({
  samples,
  spaces,
  resume,
  onSaved,
  onReadingChange,
  onAdvance,
}: {
  /** Ready-made links, the picked kinds first. */
  samples: DemoSample[];
  /** Stable preset identities kept in setup. */
  spaces: string[];
  /** A save captured before an earlier sign-in or relaunch. */
  resume: PendingDemo | null;
  onSaved: (saved: DemoSaved) => void;
  onReadingChange: (reading: boolean) => void;
  onAdvance: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const demo = useDemoSave({ spaces, resume, onSaved, onAdvance });
  const { shareSheetOpen, shareSample } = useIncomingShareUrl({
    canAccept: demo.canAcceptShare,
    readOnMount: resume === null,
    onUrl: demo.submitUrl,
    onError: demo.setError,
  });
  const [draft, setDraft] = useState("");
  const { view, setError } = demo;

  useEffect(() => {
    onReadingChange(view === "reading");
  }, [view, onReadingChange]);

  // A paste saves at once when it holds a link and shows just that link.
  // Otherwise the text stays in the field so the user sees what was pasted.
  const savePasted = (text: string) => {
    const url = linkFromText(text);
    setDraft(url ?? text.trim());
    if (url === null) {
      setError("demo.clipboardNoLink");
      return;
    }
    demo.submitUrl(url);
  };

  const pasteClipboard = async () => {
    try {
      savePasted(await Clipboard.getStringAsync());
    } catch (err) {
      analytics.captureError("onboarding_clipboard_read_failed", err);
      setError("demo.clipboardNoLink");
    }
  };

  if (view === "reading" || view === "failed") {
    const failed = view === "failed";
    const url = demo.item?.url ?? demo.savingUrl ?? "";
    return (
      <DemoReadingView
        failed={failed}
        terminal={failed && isTerminalFailure(demo.item?.failureReason)}
        host={displayHost(url)}
        url={url}
        timedOut={demo.timedOut}
        error={demo.error}
        retrying={demo.submitting}
        onRetry={() => void demo.retry()}
        onContinue={demo.advance}
        onKeepWaiting={demo.keepWaiting}
        onContinueWaiting={demo.continueAfterTimeout}
      />
    );
  }

  const errorLine =
    demo.error === null ? null : (
      <Text style={styles.error}>{t(demo.error)}</Text>
    );

  const pasteRow = (
    <View style={styles.inputRow}>
      <TextInput
        value={draft}
        onChangeText={(text) => {
          setDraft(text);
          setError(null);
        }}
        placeholder={t("demo.pastePlaceholder")}
        placeholderTextColor={theme.colors.faint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        accessibilityLabel={t("demo.linkLabel")}
        style={styles.input}
        onSubmitEditing={() => demo.submitTyped(draft)}
      />
      {draft.trim() !== "" ? (
        <Pressable
          accessibilityRole="button"
          disabled={demo.submitting}
          onPress={() => demo.submitTyped(draft)}
          style={({ pressed }) => [
            styles.inputAction,
            (pressed || demo.submitting) && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.inputActionText}>{t("demo.save")}</Text>
        </Pressable>
      ) : Clipboard.isPasteButtonAvailable ? (
        <Clipboard.ClipboardPasteButton
          acceptedContentTypes={["url", "plain-text"]}
          displayMode="iconAndLabel"
          cornerStyle="large"
          backgroundColor={theme.colors.primary}
          foregroundColor={theme.colors.primaryForeground}
          style={styles.pasteControl}
          onPress={(data) => {
            if (data.type === "text") savePasted(data.text);
          }}
        />
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => void pasteClipboard()}
          style={({ pressed }) => [
            styles.inputAction,
            pressed && { opacity: 0.85 },
          ]}
        >
          <Text style={styles.inputActionText}>{t("common.paste")}</Text>
        </Pressable>
      )}
    </View>
  );

  const footer = demo.demoUsed ? (
    <GhostButton label={t("common.continue")} onPress={demo.advance} />
  ) : demo.canSkip ? (
    <GhostButton label={t("common.continue")} onPress={demo.skip} />
  ) : null;

  return (
    <View style={styles.wrap}>
      {Platform.OS === "ios" ? (
        <SharePicker
          samples={samples}
          disabled={demo.submitting}
          error={errorLine}
          pasteRow={pasteRow}
          onShare={(url) => void shareSample(url)}
        />
      ) : (
        <PastePicker
          samples={samples}
          disabled={demo.submitting}
          error={errorLine}
          pasteRow={pasteRow}
          onPick={demo.submitUrl}
        />
      )}

      {footer === null ? null : <View style={styles.foot}>{footer}</View>}

      <DemoAuthSheet
        visible={view === "auth" && !demo.isAuthenticated && !shareSheetOpen}
        url={demo.authUrl}
        onCancel={demo.cancelAuth}
      />
    </View>
  );
}

type PickerProps = {
  samples: DemoSample[];
  disabled: boolean;
  error: ReactNode;
  pasteRow: ReactNode;
};

/** iOS: the first save goes through the real share sheet, Matter-style. */
function SharePicker({
  samples,
  disabled,
  error,
  pasteRow,
  onShare,
}: PickerProps & { onShare: (url: string) => void }) {
  useAppLocale();
  const [featured, ...others] = samples;
  return (
    <>
      <View style={styles.head}>
        <Text style={styles.headline}>{t("demo.shareTitle")}</Text>
        <Text style={styles.support}>{t("demo.shareSupport")}</Text>
      </View>

      {featured === undefined ? null : (
        <SharePost
          sample={featured}
          disabled={disabled}
          onShare={() => onShare(featured.url)}
        />
      )}

      {error}

      {others.length === 0 ? null : (
        <View style={styles.samples}>
          <Text style={styles.samplesLabel}>{t("demo.shareOthers")}</Text>
          {others.map((candidate) => (
            <SampleRow
              key={candidate.url}
              sample={candidate}
              icon="square.and.arrow.up"
              disabled={disabled}
              onPress={() => onShare(candidate.url)}
            />
          ))}
        </View>
      )}

      <View style={styles.samples}>
        <Text style={styles.samplesLabel}>{t("demo.pasteOwn")}</Text>
        {pasteRow}
      </View>
    </>
  );
}

function PastePicker({
  samples,
  disabled,
  error,
  pasteRow,
  onPick,
}: PickerProps & { onPick: (url: string) => void }) {
  useAppLocale();
  return (
    <>
      <View style={styles.head}>
        <Text style={styles.headline}>{t("demo.title")}</Text>
        <Text style={styles.support}>{t("demo.pickHelp")}</Text>
      </View>

      <ShareHint />

      {pasteRow}

      <View style={styles.samples}>
        <Text style={styles.samplesLabel}>{t("demo.samplesOr")}</Text>
        {samples.map((candidate) => (
          <SampleRow
            key={candidate.url}
            sample={candidate}
            icon="plus"
            disabled={disabled}
            onPress={() => onPick(candidate.url)}
          />
        ))}
      </View>

      {error}
    </>
  );
}

/** An illustration of the share gesture, not a control. */
function ShareHint() {
  useAppLocale();
  const { theme } = useUnistyles();
  return (
    <View
      style={styles.hint}
      accessible
      accessibilityLabel={t("demo.shareHelp")}
    >
      <View style={styles.hintArt}>
        <View style={styles.hintShare}>
          <AppSymbolIcon
            name="square.and.arrow.up"
            size={18}
            tintColor={theme.colors.primaryForeground}
          />
        </View>
        <AppSymbolIcon
          name="chevron.right"
          size={12}
          tintColor={theme.colors.faint}
        />
        <Image source={APP_ICON} style={styles.hintIcon} />
      </View>
      <Text style={styles.hintText}>{t("demo.shareHelp")}</Text>
    </View>
  );
}

/** The sample post the share sheet opens over, with its own Share button. */
function SharePost({
  sample,
  disabled,
  onShare,
}: {
  sample: DemoSample;
  disabled: boolean;
  onShare: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t("demo.shareThis")}, ${sample.pageHeading}, ${sample.domain}`}
      disabled={disabled}
      onPress={onShare}
      style={({ pressed }) => [
        styles.post,
        disabled ? { opacity: 0.4 } : pressed && { opacity: 0.85 },
      ]}
    >
      <Image
        source={SAMPLE_IMAGES[sample.kind]}
        contentFit="cover"
        style={styles.postImage}
      />
      <View style={styles.postBody}>
        <View style={styles.linkText}>
          <Text style={styles.postTitle} numberOfLines={2}>
            {sample.pageHeading}
          </Text>
          <Text style={styles.linkUrl} numberOfLines={1}>
            {sample.domain}
          </Text>
        </View>
        <View style={styles.hintShare}>
          <AppSymbolIcon
            name="square.and.arrow.up"
            size={18}
            tintColor={theme.colors.primaryForeground}
          />
        </View>
      </View>
    </Pressable>
  );
}

function SampleRow({
  sample,
  icon,
  disabled,
  onPress,
}: {
  sample: DemoSample;
  icon: "plus" | "square.and.arrow.up";
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${sample.pageHeading}, ${sample.domain}`}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sampleRow,
        disabled ? { opacity: 0.4 } : pressed && { opacity: 0.85 },
      ]}
    >
      <Image
        source={SAMPLE_IMAGES[sample.kind]}
        contentFit="cover"
        style={styles.sampleThumb}
      />
      <View style={styles.linkText}>
        <Text style={styles.linkHost} numberOfLines={1}>
          {sample.pageHeading}
        </Text>
        <Text style={styles.linkUrl} numberOfLines={1}>
          {sample.domain}
        </Text>
      </View>
      <AppSymbolIcon name={icon} size={16} tintColor={theme.colors.primary} />
    </Pressable>
  );
}

function DemoAuthSheet({
  visible,
  url,
  onCancel,
}: {
  visible: boolean;
  url: string;
  onCancel: () => void;
}) {
  useAppLocale();
  const { theme } = useUnistyles();
  const { signInWith, pendingProvider, lastError, interrupted } =
    useOAuthSignIn();
  const busy = pendingProvider !== null;
  const pageHeading =
    DEMO_SAMPLES.find((sample) => sample.url === url)?.pageHeading ??
    displayHost(url);

  // A cancel keeps the sheet open: the auth session reports its own failures
  // as cancels, and closing on them reads as a button that does nothing.
  // Back and the scrim still close it.
  const signIn = (provider: OAuthProvider) => {
    void signInWith(provider);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={busy ? undefined : onCancel}
    >
      <Pressable
        style={styles.scrim}
        onPress={busy ? undefined : onCancel}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      />
      <View style={styles.authSheet}>
        <View style={styles.grabber} />
        <Text style={styles.sheetHeadline}>{t("demo.signInTitle")}</Text>
        <Text style={styles.support}>{t("demo.signInHelp")}</Text>

        <DemoLinkRow title={pageHeading} url={url} />

        {!busy && (lastError !== null || interrupted) ? (
          <Text style={styles.error}>{t("demo.signInFailed")}</Text>
        ) : null}

        {Platform.OS === "ios" ? (
          <Pressable
            onPress={() => signIn("apple")}
            disabled={busy}
            style={({ pressed }) => [
              styles.authBtn,
              styles.authBtnApple,
              busy && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
          >
            {pendingProvider === "apple" ? (
              <ActivityIndicator color={theme.colors.background} />
            ) : (
              <Text style={[styles.authBtnText, styles.authBtnTextApple]}>
                {t("account.apple")}
              </Text>
            )}
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => signIn("google")}
          disabled={busy}
          style={({ pressed }) => [
            styles.authBtn,
            busy && { opacity: 0.4 },
            pressed && { opacity: 0.85 },
          ]}
        >
          {pendingProvider === "google" ? (
            <ActivityIndicator color={theme.colors.foreground} />
          ) : (
            <Text style={styles.authBtnText}>{t("account.google")}</Text>
          )}
        </Pressable>
        {__DEV__ && process.env.EXPO_PUBLIC_AUTH_ENABLE_ANONYMOUS === "true" ? (
          <GhostButton
            label={t("account.anonymous")}
            onPress={() => signIn("anonymous")}
            disabled={busy}
          />
        ) : null}
        <Text style={styles.privacy}>{t("demo.privacyNote")}</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  head: {
    gap: theme.gap(1),
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
  hint: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  hintArt: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  hintShare: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  hintIcon: {
    width: 36,
    height: 36,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
  },
  hintText: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 19,
    color: theme.colors.foreground,
  },
  post: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  postImage: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: theme.colors.primarySoft,
  },
  postBody: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(1.5),
  },
  postTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 17,
    lineHeight: 22,
    color: theme.colors.foreground,
  },
  pasteControl: {
    width: 104,
    height: 48,
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
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  input: {
    flex: 1,
    fontFamily: theme.fonts.regular,
    fontSize: 16,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    height: 48,
    paddingHorizontal: theme.gap(1.5),
  },
  inputAction: {
    minWidth: 88,
    height: 48,
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  inputActionText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.primaryForeground,
  },
  samples: {
    gap: theme.gap(1),
  },
  samplesLabel: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.muted,
  },
  sampleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    padding: theme.gap(1),
    paddingRight: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  sampleThumb: {
    width: 48,
    height: 48,
    borderRadius: theme.radius.sm,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primarySoft,
  },
  scrim: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
  },
  authSheet: {
    backgroundColor: theme.colors.background,
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    borderCurve: "continuous",
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(1),
    paddingBottom: rt.insets.bottom + theme.gap(2),
    gap: theme.gap(1.5),
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.colors.border,
    marginBottom: theme.gap(1),
  },
  sheetHeadline: {
    fontFamily: theme.fonts.bold,
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.foreground,
  },
  authBtn: {
    minHeight: 52,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  authBtnApple: {
    backgroundColor: theme.colors.foreground,
    borderColor: theme.colors.foreground,
  },
  authBtnText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  authBtnTextApple: {
    color: theme.colors.background,
  },
  privacy: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    textAlign: "center",
    color: theme.colors.faint,
  },
}));
