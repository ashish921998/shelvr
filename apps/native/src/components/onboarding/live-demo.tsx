import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { DEMO_SAMPLES, type DemoSample } from "@/lib/onboarding-demo";
import type { PendingDemo } from "@/lib/pending-onboarding";
import { displayHost } from "@/lib/url";
import { useDemoSave, linkFromText, type DemoSaved } from "@/lib/use-demo-save";
import { useIncomingShareUrl } from "@/lib/use-incoming-share-url";
import { useOAuthSignIn } from "@/lib/oauth-sign-in";
import {
  DemoLinkRow,
  DemoPreviewView,
  DemoReadingView,
} from "@/components/onboarding/demo-reading-view";
import { GhostButton } from "@/components/onboarding/parts";
import { SampleCard, SampleRow } from "@/components/onboarding/sample-card";
import { SampleSignIn } from "@/components/onboarding/sample-sign-in";
import { SignInButtons } from "@/components/onboarding/sign-in-buttons";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { isTerminalFailure } from "@convex/model/itemFields";
import * as Clipboard from "expo-clipboard";
import { useEffect, useState, type ReactNode } from "react";
import { Modal, Pressable, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The first save is a pasted, typed or ready-made link; a link shared from
// another app still arrives through expo-sharing. The save pipeline lives in
// useDemoSave, share intake in useIncomingShareUrl.

export type { DemoSaved };

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
  const demo = useDemoSave({
    spaces,
    resume,
    onSaved,
    onAdvance,
  });
  useIncomingShareUrl({
    canAccept: demo.canAcceptShare,
    readOnMount: resume === null,
    onSharedUrl: demo.submitSharedUrl,
  });
  const [draft, setDraft] = useState("");
  const { view, setError } = demo;

  useEffect(() => {
    onReadingChange(view === "reading" || view === "preview");
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

  if (view === "preview") {
    const url = demo.savingUrl ?? "";
    return (
      <DemoPreviewView
        title={
          DEMO_SAMPLES.find((sample) => sample.url === url)?.pageHeading ??
          displayHost(url)
        }
        url={url}
        onDone={demo.previewed}
      />
    );
  }

  // A previewed sample (or one restored after a relaunch) asks for sign-in
  // on its own screen. A previewed one keeps that screen up while its save
  // lands, then goes to the reveal; a restored one reads here like any other.
  const authSample =
    view === "auth"
      ? DEMO_SAMPLES.find((sample) => sample.url === demo.authUrl)
      : undefined;
  if (authSample !== undefined) {
    return (
      <SampleSignIn
        sample={authSample}
        space={demo.authRequest?.destination ?? null}
        saving={demo.isAuthenticated}
        onNotNow={demo.cancelAuth}
      />
    );
  }

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
  // An error about the link field sits under the field; everything else
  // (a failed save) stays by the control it came from.
  const inputError =
    demo.error === "demo.clipboardNoLink" || demo.error === "demo.notALink";

  const pasteRow = (
    <View style={styles.inputBlock}>
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
      {inputError ? errorLine : null}
    </View>
  );

  const footer = demo.demoUsed ? (
    <GhostButton label={t("common.continue")} onPress={demo.advance} />
  ) : demo.canSkip ? (
    <GhostButton label={t("common.continue")} onPress={demo.skip} />
  ) : null;

  return (
    <View style={styles.wrap}>
      <SamplePicker
        samples={samples}
        disabled={demo.submitting}
        error={inputError ? null : errorLine}
        pasteRow={pasteRow}
        onPick={demo.submitUrl}
      />

      {footer === null ? null : <View style={styles.foot}>{footer}</View>}

      <DemoAuthSheet
        visible={view === "auth" && !demo.isAuthenticated}
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

/** The first save is one tap on a sample matched to the kinds picked in
 * setup. The share sheet is taught after it, once the first save has landed
 * (see share-practice.tsx). */
function SamplePicker({
  samples,
  disabled,
  error,
  pasteRow,
  onPick,
}: PickerProps & { onPick: (url: string) => void }) {
  useAppLocale();
  const [featured, ...others] = samples;
  return (
    <>
      <View style={styles.head}>
        <Text
          style={styles.headline}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t("demo.title")}
        </Text>
        <Text style={styles.support}>{t("demo.pickHelp")}</Text>
      </View>

      {featured === undefined ? null : (
        <SampleCard
          sample={featured}
          action="save"
          disabled={disabled}
          onPress={() => onPick(featured.url)}
        />
      )}

      {error}

      {others.length === 0 ? null : (
        <View style={styles.samples}>
          <Text style={styles.samplesLabel}>{t("demo.samplesOr")}</Text>
          {others.map((candidate) => (
            <SampleRow
              key={candidate.url}
              sample={candidate}
              icon="plus"
              disabled={disabled}
              onPress={() => onPick(candidate.url)}
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
  const oauth = useOAuthSignIn("demo_sheet");
  const busy = oauth.pendingProvider !== null;

  useEffect(() => {
    if (!visible) return;
    analytics.capture("onboarding_signin_prompt", {
      surface: "demo_sheet",
      action: "shown",
    });
  }, [visible]);

  const dismiss = () => {
    analytics.capture("onboarding_signin_prompt", {
      surface: "demo_sheet",
      action: "dismissed",
    });
    onCancel();
  };
  const pageHeading =
    DEMO_SAMPLES.find((sample) => sample.url === url)?.pageHeading ??
    displayHost(url);

  // A cancel keeps the sheet open: the auth session reports its own failures
  // as cancels, and closing on them reads as a button that does nothing.
  // Back and the scrim still close it.
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={busy ? undefined : dismiss}
    >
      <Pressable
        style={styles.scrim}
        onPress={busy ? undefined : dismiss}
        accessibilityRole="button"
        accessibilityLabel={t("common.back")}
      />
      <View style={styles.authSheet}>
        <View style={styles.grabber} />
        <Text style={styles.sheetHeadline}>{t("demo.signInTitle")}</Text>
        <Text style={styles.support}>{t("demo.signInHelp")}</Text>

        <DemoLinkRow title={pageHeading} url={url} />

        <SignInButtons oauth={oauth} />
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
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
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
  pasteControl: {
    width: 104,
    height: 48,
  },
  inputBlock: {
    gap: theme.gap(1),
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
}));
