import { api } from "@convex/_generated/api";
import { useMutation, useQuery } from "convex/react";
import * as WebBrowser from "expo-web-browser";
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
import { X_CONNECT_RETURN_URL, xConnectOutcome } from "@/lib/x-import";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type ImportPhase = "idle" | "importing" | "done";

/** Connect X once and its bookmarks come in on their own. Hidden until the
 * backend reports the X app credentials are set. */
function XConnectCard() {
  const { theme } = useUnistyles();
  const state = useQuery(api.xImport.getXConnection);
  const startXConnect = useMutation(api.xImport.startXConnect);
  const syncXNow = useMutation(api.xImport.syncXNow);
  const disconnectX = useMutation(api.xImport.disconnectX);
  const { guard } = usePaywallGuard("add");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const connect = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const { url } = await startXConnect();
      const result = await WebBrowser.openAuthSessionAsync(
        url,
        X_CONNECT_RETURN_URL,
      );
      const outcome = xConnectOutcome(result);
      analytics.capture("x_connect_finished", { outcome });
      if (outcome === "failed") setNotice(t("import.xConnectFailed"));
    } catch (error) {
      analytics.captureError("x_connect_failed", error);
      setNotice(t("import.xConnectFailed"));
    } finally {
      setBusy(false);
    }
  }, [startXConnect]);

  const syncNow = useCallback(async () => {
    setNotice(null);
    try {
      if (await syncXNow()) setNotice(t("import.xSyncStarted"));
    } catch (error) {
      analytics.captureError("x_sync_request_failed", error);
    }
  }, [syncXNow]);

  const disconnect = useCallback(async () => {
    setNotice(null);
    try {
      await disconnectX();
      analytics.capture("x_disconnected");
    } catch (error) {
      analytics.captureError("x_disconnect_failed", error);
    }
  }, [disconnectX]);

  if (state === undefined || !state.available) return null;
  const connection = state.connection;
  const active = connection?.status === "active";

  return (
    <View style={styles.xCard}>
      <View style={styles.hintHeader}>
        <AppSymbolIcon
          name={active ? "checkmark.circle.fill" : "bookmark"}
          size={18}
          tintColor={active ? theme.colors.primary : theme.colors.foreground}
        />
        <Text style={styles.xTitle}>
          {connection === null
            ? t("import.xConnectTitle")
            : active
              ? t("import.xConnectedTitle")
              : t("import.xReconnectTitle")}
        </Text>
      </View>
      {connection !== null && active ? (
        <>
          <Text style={styles.hintText}>
            {t("import.xConnectedCount", { count: connection.importedCount })}
          </Text>
          <Text style={styles.hintText}>{t("import.xConnectedBody")}</Text>
        </>
      ) : (
        <Text style={styles.hintText}>
          {connection === null
            ? t("import.xConnectBody")
            : t("import.xReconnectBody")}
        </Text>
      )}
      {notice !== null ? <Text style={styles.xNotice}>{notice}</Text> : null}
      {active ? (
        <View style={styles.resultActions}>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            onPress={() => void disconnect()}
          >
            <Text style={styles.secondaryButtonText}>
              {t("import.xDisconnect")}
            </Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            onPress={() => void syncNow()}
          >
            <Text style={styles.primaryButtonText}>{t("import.xSyncNow")}</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={({ pressed }) => [
            styles.importButton,
            pressed && { opacity: 0.7 },
            busy && { opacity: 0.4 },
          ]}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void guard(() => void connect())}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.importButtonText}>
              {t("import.xConnectAction")}
            </Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

export default function ImportScreen() {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [result, setResult] = useState<ImportSummary | null>(null);

  const importLinks = useMutation(api.items.importLinks);
  const { guard } = usePaywallGuard("add");
  const xState = useQuery(api.xImport.getXConnection);
  const xAvailable = xState?.available === true;

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

      <XConnectCard />

      {xAvailable ? (
        <Text style={styles.hintTitle}>{t("import.pasteTitle")}</Text>
      ) : null}
      <Text style={styles.description}>{t("import.description")}</Text>

      {/* The archive route is the fallback while connecting X is not offered. */}
      {!xAvailable ? (
        <View style={styles.hintBox}>
          <View style={styles.hintHeader}>
            <AppSymbolIcon
              name="link"
              size={16}
              tintColor={theme.colors.muted}
            />
            <Text style={styles.hintTitle}>{t("import.xHintTitle")}</Text>
          </View>
          <Text style={styles.hintText}>{t("import.xHintBody")}</Text>
        </View>
      ) : null}

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
  xCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.gap(2.5),
    gap: theme.gap(1.25),
  },
  xTitle: {
    flex: 1,
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.foreground,
  },
  xNotice: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primary,
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
