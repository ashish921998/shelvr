import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

import { AppSymbolIcon } from "@/components/symbol";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { analytics } from "@/lib/analytics";
import { formatItemDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";

/** A live pairing code: what to show, and when it stops being usable. */
type PairingCode = { code: string; expiresAt: number };

/** `9:32`. The code's whole point is that it expires, so the screen says when
 * rather than leaving the user to find out by typing it. */
function formatCountdown(remainingMs: number): string {
  const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function BrowserExtensionScreen() {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const createPairingCode = useAction(api.extension.createPairingCode);
  const revokeConnection = useMutation(api.extension.revokeConnection);
  const { data: connections } = useQuery(
    convexQuery(api.extension.listConnections, {}),
  );

  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [creating, setCreating] = useState(false);
  const [remainingMs, setRemainingMs] = useState(0);

  // One second-resolution ticker, alive only while a code is on screen. It
  // stops itself the moment the code expires, so an abandoned screen is not
  // re-rendering in the background.
  useEffect(() => {
    if (pairing === null) return;
    const tick = () => setRemainingMs(pairing.expiresAt - Date.now());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pairing]);

  const expired = pairing !== null && remainingMs <= 0;

  const requestCode = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const result = await createPairingCode({});
      setPairing(result);
      analytics.capture("extension_pairing_code_created");
    } catch (error) {
      analytics.captureError("extension_pairing_code_failed", error);
      Alert.alert(t("extension.codeFailed"), t("errors.trySoon"));
    } finally {
      setCreating(false);
    }
  }, [createPairingCode, creating]);

  const confirmDisconnect = (
    connectionId: Parameters<typeof revokeConnection>[0]["connectionId"],
    label: string,
  ) => {
    Alert.alert(
      t("extension.disconnectTitle", { browser: label }),
      t("extension.disconnectBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("extension.disconnect"),
          style: "destructive",
          onPress: () => {
            void (async () => {
              try {
                await revokeConnection({ connectionId });
                analytics.capture("extension_connection_revoked");
              } catch (error) {
                analytics.captureError("extension_revoke_failed", error);
                Alert.alert(
                  t("extension.disconnectFailed"),
                  t("errors.trySoon"),
                );
              }
            })();
          },
        },
      ],
    );
  };

  const close = () => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace("/");
  };

  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <Stack.Screen
        options={{
          title: t("extension.title"),
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

      <Text style={styles.description}>{t("extension.description")}</Text>

      {pairing === null ? (
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && { opacity: 0.7 },
            creating && { opacity: 0.4 },
          ]}
          accessibilityRole="button"
          disabled={creating}
          onPress={() => void requestCode()}
        >
          <Text style={styles.primaryButtonText}>
            {creating ? t("extension.creating") : t("extension.connect")}
          </Text>
        </Pressable>
      ) : (
        <View style={styles.codeBox}>
          <Text style={styles.codeLabel}>{t("extension.codeLabel")}</Text>
          <Text
            selectable
            style={[styles.code, expired && styles.codeExpired]}
            accessibilityLabel={t("extension.codeAccessibility", {
              // Read out character by character: "K7F2-9QTX" as a word is no
              // use to anyone typing it into a browser.
              characters: pairing.code.replace(/-/g, "").split("").join(" "),
            })}
          >
            {pairing.code}
          </Text>
          <Text style={[styles.countdown, expired && styles.countdownExpired]}>
            {expired
              ? t("extension.expired")
              : t("extension.expiresIn", {
                  time: formatCountdown(remainingMs),
                })}
          </Text>
          <Text style={styles.steps}>{t("extension.steps")}</Text>
          <Pressable
            style={({ pressed }) => [
              styles.secondaryButton,
              pressed && { opacity: 0.7 },
              creating && { opacity: 0.4 },
            ]}
            accessibilityRole="button"
            disabled={creating}
            onPress={() => void requestCode()}
          >
            <Text style={styles.secondaryButtonText}>
              {t("extension.newCode")}
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionHeading}>{t("extension.connected")}</Text>
        {connections === undefined ? null : connections.length === 0 ? (
          <Text style={styles.empty}>{t("extension.noneConnected")}</Text>
        ) : (
          <View style={styles.list}>
            {connections.map((connection) => (
              <View key={connection.id} style={styles.row}>
                <AppSymbolIcon
                  name="puzzlepiece.extension"
                  size={18}
                  tintColor={theme.colors.muted}
                />
                <View style={styles.rowCopy}>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {connection.label}
                  </Text>
                  <Text style={styles.rowDetail}>
                    {connection.lastUsedAt === undefined
                      ? t("extension.connectedOn", {
                          date: formatItemDate(connection.createdAt),
                        })
                      : t("extension.lastUsed", {
                          date: formatItemDate(connection.lastUsedAt),
                        })}
                  </Text>
                </View>
                <Pressable
                  style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                  accessibilityRole="button"
                  accessibilityLabel={t("extension.disconnectTitle", {
                    browser: connection.label,
                  })}
                  onPress={() =>
                    confirmDisconnect(connection.id, connection.label)
                  }
                >
                  <Text style={styles.disconnect}>
                    {t("extension.disconnect")}
                  </Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>
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
  primaryButton: {
    alignItems: "center",
    paddingVertical: theme.gap(1.75),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    backgroundColor: theme.colors.primary,
  },
  primaryButtonText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.primaryForeground,
  },
  codeBox: {
    alignItems: "center",
    padding: theme.gap(2.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    gap: theme.gap(1),
  },
  codeLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
    textAlign: "center",
  },
  code: {
    fontFamily: theme.fonts.bold,
    fontSize: 34,
    letterSpacing: 4,
    color: theme.colors.foreground,
  },
  codeExpired: {
    color: theme.colors.faint,
  },
  countdown: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  countdownExpired: {
    color: theme.colors.danger,
  },
  steps: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: theme.colors.muted,
    alignSelf: "stretch",
    marginTop: theme.gap(0.5),
  },
  secondaryButton: {
    alignSelf: "stretch",
    alignItems: "center",
    paddingVertical: theme.gap(1.25),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  section: {
    gap: theme.gap(1),
    marginTop: theme.gap(1),
  },
  sectionHeading: {
    fontFamily: theme.fonts.bold,
    fontSize: 14,
    color: theme.colors.foreground,
  },
  empty: {
    fontFamily: theme.fonts.regular,
    fontSize: 14,
    color: theme.colors.muted,
  },
  list: {
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  rowCopy: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  rowDetail: {
    fontFamily: theme.fonts.regular,
    fontSize: 12.5,
    color: theme.colors.muted,
  },
  disconnect: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.danger,
  },
}));
