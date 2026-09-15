import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { AppSymbolIcon } from "@/components/symbol";
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
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type ImportPhase = "idle" | "importing" | "done";

export default function ImportScreen() {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
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
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen
        options={{
          title: t("import.title"),
          headerBackButtonDisplayMode: "minimal",
          headerLeft: () =>
            Platform.OS === "android" ? (
              <HeaderIconButton
                icon="xmark"
                label={t("common.close")}
                onPress={close}
              />
            ) : undefined,
        }}
      />

      <Text style={styles.description}>{t("import.description")}</Text>

      <View style={styles.hintBox}>
        <View style={styles.hintHeader}>
          <AppSymbolIcon name="link" size={16} tintColor={theme.colors.muted} />
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
          placeholderTextColor={theme.colors.muted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          editable={phase !== "importing"}
        />
      ) : null}

      {urls.length > 0 && phase !== "done" ? (
        <Text style={styles.urlCount}>
          {t("import.urlReady", { count: urls.length })}
        </Text>
      ) : null}

      {phase === "importing" ? (
        <View style={styles.progressBox}>
          <Text style={styles.progressText}>
            {t("import.progress", { count: urls.length })}
          </Text>
        </View>
      ) : null}

      {phase === "done" && result ? (
        <View style={styles.resultBox}>
          <View style={styles.resultRow}>
            <AppSymbolIcon
              name="checkmark.circle.fill"
              size={28}
              tintColor={theme.colors.primary}
            />
            <Text style={styles.resultTitle}>
              {t("import.resultCount", { count: result.created })}
            </Text>
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
          <View style={styles.resultActions}>
            <Pressable
              style={({ pressed }) => [
                styles.secondaryButton,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              onPress={reset}
            >
              <Text style={styles.secondaryButtonText}>
                {result.stopped ? t("common.tryAgain") : t("import.more")}
              </Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              onPress={close}
            >
              <Text style={styles.primaryButtonText}>{t("common.done")}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {phase === "idle" ? (
        <Pressable
          style={({ pressed }) => [
            styles.importButton,
            pressed && { opacity: 0.7 },
            !canImport && { opacity: 0.4 },
          ]}
          accessibilityRole="button"
          disabled={!canImport}
          onPress={handleImport}
        >
          <Text style={styles.importButtonText}>{t("import.action")}</Text>
        </Pressable>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  content: {
    flexGrow: 1,
    padding: theme.gap(3),
    paddingTop: theme.gap(2),
    paddingBottom: theme.gap(4),
    gap: theme.gap(2),
  },
  description: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  hintBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: "top",
  },
  urlCount: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.primary,
  },
  progressBox: {
    alignItems: "center",
    paddingVertical: theme.gap(3),
  },
  progressText: {
    fontFamily: theme.fonts.medium,
    fontSize: 16,
    color: theme.colors.foreground,
  },
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
  resultTitle: {
    fontFamily: theme.fonts.bold,
    fontSize: 18,
    color: theme.colors.foreground,
  },
  resultDetail: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
  },
  resultActions: {
    flexDirection: "row",
    gap: theme.gap(1.5),
    marginTop: theme.gap(1),
  },
  secondaryButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  primaryButton: {
    flex: 1,
    alignItems: "center",
    paddingVertical: theme.gap(1.5),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: "#fff",
  },
  importButton: {
    alignItems: "center",
    paddingVertical: theme.gap(1.75),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
  },
  importButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: "#fff",
  },
}));
