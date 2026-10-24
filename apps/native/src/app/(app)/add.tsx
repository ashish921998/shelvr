import { t, useAppLocale } from "@/lib/i18n";
import { AnimatedText } from "@/components/animated-text";
import {
  BottomSheet,
  BottomSheetView,
  type BottomSheetMethods,
} from "@expo/ui/community/bottom-sheet";
import { openPaywall } from "@/lib/entitlement";
import { backOrHome } from "@/lib/screen-dismiss";
import { saveErrorCode, saveFailureStage } from "@convex/model/saveErrors";
import { api } from "@convex/_generated/api";
import { useMutation } from "convex/react";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInputInstance,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";
import { typedLink } from "@/lib/url";

const PAYWALL_PLACEMENT = "add";

function AndroidAddHeader({
  canSave,
  close,
  save,
}: {
  canSave: boolean;
  close: () => void;
  save: () => void;
}) {
  useAppLocale();
  const [titleWidth, setTitleWidth] = useState(0);
  const measureTitle = useCallback((event: LayoutChangeEvent) => {
    setTitleWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.androidHeader}>
      <HeaderIconButton
        icon="xmark"
        label={t("common.close")}
        onPress={close}
      />
      <View style={styles.androidHeaderTitleContainer} onLayout={measureTitle}>
        {titleWidth > 0 ? (
          <AnimatedText
            text={t("capture.articleTitle")}
            width={titleWidth}
            truncate
            height={44}
            style={styles.androidHeaderTitle}
          />
        ) : null}
      </View>
      <HeaderIconButton
        icon="checkmark"
        label={t("common.save")}
        disabled={!canSave}
        onPress={save}
      />
    </View>
  );
}

/** The + sheet takes one thing: a link to a reel, TikTok or page that names places. */
function AddContent({ close }: { close: () => void }) {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<TextInputInstance>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createLinkItem = useMutation(api.items.createLinkItem);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !saving;

  useEffect(() => {
    if (Platform.OS !== "android") return;
    focusTimer.current = setTimeout(() => inputRef.current?.focus(), 350);
    return () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    };
  }, []);

  const dismiss = () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    close();
  };

  const save = async () => {
    if (!canSave) return;
    const link = typedLink(trimmed);
    if (link === null) {
      Alert.alert(t("errors.saveTitle"), t("errors.notALink"));
      return;
    }
    setSaving(true);
    const operationId = `link:${Crypto.randomUUID()}`;
    analytics.capture("save_attempt_started", {
      save_source: "manual_link",
      save_kind: "link",
      operation_id: operationId,
    });
    try {
      await createLinkItem({
        url: link,
        operationId,
        analyticsSessionId: analytics.sessionId(),
        saveSource: "manual_link",
      });
      analytics.capture("article_saved");
      if (process.env.EXPO_OS === "ios") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      dismiss();
    } catch (error) {
      analytics.capture("save_failed", {
        save_source: "manual_link",
        save_kind: "link",
        stage: saveFailureStage(error),
        operation_id: operationId,
      });
      setSaving(false);
      if (saveErrorCode(error) === "pro_required") {
        await openPaywall(router, PAYWALL_PLACEMENT);
        return;
      }
      Alert.alert(t("errors.saveTitle"), t("errors.tryAgain"));
    }
  };

  return (
    <View style={styles.content}>
      <Stack.Screen
        options={{
          headerShown: Platform.OS !== "android",
          headerTransparent: false,
          headerStyle: { backgroundColor: theme.colors.background },
        }}
      />
      {Platform.OS === "ios" ? (
        <>
          <Stack.Title asChild>
            <AnimatedText
              text={t("capture.articleTitle")}
              style={styles.heading}
              truncate
            />
          </Stack.Title>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="xmark"
              tintColor={theme.colors.foreground}
              onPress={dismiss}
            >
              {t("common.close")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
          <Stack.Toolbar placement="right">
            <Stack.Toolbar.Button
              icon="checkmark"
              tintColor={canSave ? theme.colors.primary : theme.colors.muted}
              onPress={save}
            >
              {t("common.save")}
            </Stack.Toolbar.Button>
          </Stack.Toolbar>
        </>
      ) : (
        <AndroidAddHeader canSave={canSave} close={dismiss} save={save} />
      )}
      <TextInput
        ref={inputRef}
        testID="add-article-input"
        style={styles.articleInput}
        value={value}
        onChangeText={setValue}
        placeholder={t("capture.linkPlaceholder")}
        placeholderTextColor={theme.colors.muted}
        autoFocus={Platform.OS !== "android"}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="done"
        onSubmitEditing={save}
        editable={!saving}
      />
      <Text style={styles.hint}>{t("capture.linkHint")}</Text>
    </View>
  );
}

function AndroidAddSheet() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const close = useCallback(() => sheetRef.current?.close(), []);

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      enableDynamicSizing
      enablePanDownToClose
      onClose={() => backOrHome(router)}
      backgroundStyle={{ backgroundColor: theme.colors.background }}
    >
      <BottomSheetView>
        <AddContent close={close} />
      </BottomSheetView>
    </BottomSheet>
  );
}

export default function AddScreen() {
  const router = useRouter();
  if (Platform.OS === "android") return <AndroidAddSheet />;
  return <AddContent close={() => backOrHome(router)} />;
}

const styles = StyleSheet.create((theme) => ({
  content: {
    padding: theme.gap(2.5),
    paddingTop: theme.gap(2),
    gap: theme.gap(1.5),
  },
  heading: {
    fontFamily: theme.fonts.display,
    fontSize: 24,
    color: theme.colors.foreground,
  },
  androidHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  androidHeaderTitle: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.foreground,
  },
  androidHeaderTitleContainer: {
    flex: 1,
  },

  hint: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  articleInput: {
    fontFamily: theme.fonts.regular,
    fontSize: 18,
    color: theme.colors.foreground,
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
}));
