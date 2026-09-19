import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { useRouter } from "expo-router";
import { InkIcon } from "@/components/ink/ink-icon";
import { InkRing } from "@/components/ink/ink-ring";
import { StitchLine } from "@/components/ink/stitch-line";
import { INK_A11Y } from "@/components/ink/ink-canvas";
import { PrimaryButton, SecondaryButton } from "@/components/shelf/ink-button";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { Headline, Eyebrow } from "@/components/shelf/typography";
import { useInkClock } from "@/lib/ink/use-ink-clock";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { usePaywallGuard } from "@/lib/entitlement";
import { analytics } from "@/lib/analytics";
import { t, useAppLocale } from "@/lib/i18n";
import {
  importInBatches,
  parseImportText,
  type ImportSummary,
} from "@/lib/import-links";
import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, TextInput, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type ImportPhase = "idle" | "importing" | "done";

/** The stitch that closes the result panel, drawn at the panel's inner width. */
const RESULT_STITCH_WIDTH = 240;

export default function ImportScreen() {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const clock = useInkClock();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [result, setResult] = useState<ImportSummary | null>(null);

  const importLinks = useMutation(api.items.importLinks);
  const { guard } = usePaywallGuard("add");

  const urls = useMemo(() => parseImportText(text), [text]);

  const canImport = urls.length > 0 && phase === "idle";

  const runImport = useCallback(async () => {
    if (urls.length === 0) return;
    setPhase("importing");
    setResult(null);
    const summary = await importInBatches(urls, (batch, staggerOffset) =>
      importLinks({ urls: batch, staggerOffset }),
    );
    if (summary.stopped === "failed") {
      analytics.captureError("links_import_failed", summary.error);
    }
    setResult(summary);
    setPhase("done");
    if (summary.created > 0) {
      analytics.capture("links_imported", {
        url_count: urls.length,
        created: summary.created,
        skipped: summary.skipped,
        invalid: summary.invalid,
        not_processed: summary.notProcessed,
      });
    }
  }, [urls, importLinks]);

  const close = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/");
    }
  };

  const handleImport = () => {
    guard(runImport);
  };

  // A stopped import keeps the pasted list, so trying again later resumes:
  // links already saved are skipped.
  const reset = () => {
    if (!result?.stopped) setText("");
    setPhase("idle");
    setResult(null);
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        clock={clock}
        title={t("import.title")}
        right={
          <HeaderIconButton
            icon="xmark"
            label={t("common.close")}
            onPress={close}
          />
        }
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.description}>{t("import.description")}</Text>

        <View style={styles.hintBox}>
          <View style={styles.hintHeader}>
            <InkIcon
              name="link"
              size={16}
              tint={theme.colors.muted}
              clock={clock}
            />
            <Text style={styles.hintTitle}>{t("import.xHintTitle")}</Text>
          </View>
          <Text style={styles.hintText}>{t("import.xHintBody")}</Text>
        </View>

        {phase !== "done" ? (
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t("import.placeholder")}
            placeholderTextColor={theme.colors.faint}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            editable={phase !== "importing"}
          />
        ) : null}

        {urls.length > 0 && phase !== "done" ? (
          <Eyebrow style={styles.urlCount}>
            {t("import.urlReady", { count: urls.length })}
          </Eyebrow>
        ) : null}

        {phase === "done" && result ? (
          <View style={styles.resultBox}>
            <View style={styles.resultRow}>
              {/* A drawn tick in a ring is how the app says a batch landed. */}
              <View style={styles.tick} {...INK_A11Y}>
                <View style={styles.tickRing} pointerEvents="none">
                  <InkRing width={34} height={34} clock={clock} />
                </View>
                <InkIcon name="checkmark" size={18} clock={clock} />
              </View>
              <Headline style={styles.resultTitle}>
                {t("import.resultCount", { count: result.created })}
              </Headline>
            </View>
            {result.skipped > 0 ? (
              <Text style={styles.resultDetail}>
                {t("import.skipped", { count: result.skipped })}
              </Text>
            ) : null}
            {result.invalid > 0 ? (
              <Text style={styles.resultDetail}>
                {t("import.invalid", { count: result.invalid })}
              </Text>
            ) : null}
            {result.stopped ? (
              <>
                <Text style={styles.resultDetail}>
                  {t("import.notProcessed", { count: result.notProcessed })}
                </Text>
                <Text style={styles.resultDetail}>
                  {result.stopped === "rate_limited"
                    ? t("import.rateLimited")
                    : t("import.failed")}
                </Text>
              </>
            ) : null}
            <View style={styles.resultStitch} {...INK_A11Y}>
              <StitchLine width={RESULT_STITCH_WIDTH} clock={clock} />
            </View>
            <View style={styles.resultActions}>
              <SecondaryButton
                label={result.stopped ? t("common.tryAgain") : t("import.more")}
                onPress={reset}
                style={styles.resultAction}
              />
              <PrimaryButton
                label={t("common.done")}
                onPress={close}
                style={styles.resultAction}
              />
            </View>
          </View>
        ) : null}

        {phase !== "done" ? (
          // The button is the progress: stitches run along it while the
          // batch uploads. Nothing spins.
          <PrimaryButton
            label={t("import.action")}
            pendingLabel={t("import.progress", { count: urls.length })}
            state={
              phase === "importing"
                ? "pending"
                : canImport
                  ? "idle"
                  : "disabled"
            }
            onPress={handleImport}
            style={styles.importButton}
            testID="import-links"
          />
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  content: {
    flexGrow: 1,
    paddingHorizontal: theme.gap(3),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(5),
    gap: theme.gap(2),
  },
  description: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  hintBox: {
    backgroundColor: theme.colors.surfaceMuted,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    padding: theme.gap(2),
    gap: theme.gap(1),
  },
  hintHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
  },
  hintTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  hintText: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.muted,
  },
  input: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.foreground,
    minHeight: 160,
    padding: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: "top",
  },
  urlCount: { color: theme.colors.primaryText },
  resultBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(2.5),
    gap: theme.gap(1.5),
  },
  resultRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
  },
  tick: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  tickRing: { position: "absolute", left: 0, top: 0 },
  resultTitle: { flex: 1 },
  resultDetail: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    color: theme.colors.muted,
  },
  resultStitch: { alignItems: "center" },
  resultActions: {
    flexDirection: "row",
    gap: theme.gap(1.5),
  },
  resultAction: { flex: 1 },
  importButton: { alignSelf: "stretch", marginTop: "auto" },
}));
