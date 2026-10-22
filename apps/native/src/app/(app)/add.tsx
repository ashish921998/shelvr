import { t, useAppLocale } from "@/lib/i18n";
import { AnimatedText } from "@/components/animated-text";
import {
  BottomSheet,
  BottomSheetView,
  type BottomSheetMethods,
} from "@expo/ui/community/bottom-sheet";
import { pickAndSaveImages } from "@/lib/pick-and-save-images";
import { openPaywall, usePaywallGuard } from "@/lib/entitlement";
import { useSaveImageBatch } from "@/lib/use-save-image-batch";
import { saveErrorCode, saveFailureStage } from "@convex/model/saveErrors";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type TextInputInstance,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";
import { typedLink } from "@/lib/url";

type Mode = "menu" | "note" | "article";
type AndroidDismissAction = { type: "camera"; spaceId?: Id<"spaces"> } | null;

const PAYWALL_PLACEMENT = "add";

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: AppSymbolName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[styles.action, disabled && { opacity: 0.4 }]}
    >
      <View style={styles.actionIcon}>
        <AppSymbolIcon
          name={icon}
          size={26}
          tintColor={theme.colors.foreground}
        />
      </View>
      <Text style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function AndroidAddHeader({
  title,
  isComposer,
  canSave,
  back,
  save,
}: {
  title: string;
  isComposer: boolean;
  canSave: boolean;
  back: () => void;
  save: () => void;
}) {
  useAppLocale();
  const [titleWidth, setTitleWidth] = useState(0);
  const measureTitle = useCallback((event: LayoutChangeEvent) => {
    setTitleWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={styles.androidHeader}>
      {isComposer ? (
        <HeaderIconButton
          icon="chevron.left"
          label={t("capture.backToOptions")}
          onPress={back}
        />
      ) : (
        <View style={styles.androidHeaderSpacer} />
      )}
      <View style={styles.androidHeaderTitleContainer} onLayout={measureTitle}>
        {titleWidth > 0 ? (
          <AnimatedText
            text={title}
            width={titleWidth}
            truncate
            height={44}
            style={styles.androidHeaderTitle}
          />
        ) : null}
      </View>
      {isComposer ? (
        <HeaderIconButton
          icon="checkmark"
          label={t("common.save")}
          disabled={!canSave}
          onPress={save}
        />
      ) : (
        <View style={styles.androidHeaderSpacer} />
      )}
    </View>
  );
}

type AddContentProps = {
  close: () => void;
  openCamera: (spaceId?: Id<"spaces">) => void;
};

function AddContent({ close, openCamera }: AddContentProps) {
  useAppLocale();
  const { theme } = useUnistyles();
  const router = useRouter();
  const { spaceId, mode: startMode } = useLocalSearchParams<{
    spaceId?: string;
    mode?: string;
  }>();
  const pinnedSpaceId = spaceId as Id<"spaces"> | undefined;
  const [mode, setMode] = useState<Mode>("menu");
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState("");
  const inputRef = useRef<TextInputInstance>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const createLinkItem = useMutation(api.items.createLinkItem);
  const createNoteItem = useMutation(api.items.createNoteItem);
  const { guard, loading: entitlementLoading } =
    usePaywallGuard(PAYWALL_PLACEMENT);

  const startChecked = useRef(false);
  useEffect(() => {
    if (startMode !== "note" || entitlementLoading || startChecked.current) {
      return;
    }
    startChecked.current = true;
    void guard().then((entitled) => {
      if (entitled) setMode("note");
    });
  }, [startMode, entitlementLoading, guard]);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !saving;

  useEffect(() => {
    if (Platform.OS !== "android" || mode === "menu") return;
    focusTimer.current = setTimeout(() => inputRef.current?.focus(), 350);
    return () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
    };
  }, [mode]);

  const dismiss = () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    close();
  };

  const success = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    dismiss();
  };

  const openComposer = (next: Mode) => {
    setValue("");
    setMode(next);
  };

  const save = async () => {
    if (!canSave) return;
    const link = mode === "article" ? typedLink(trimmed) : null;
    if (mode === "article" && link === null) {
      Alert.alert(t("errors.saveTitle"), t("errors.notALink"));
      return;
    }
    setSaving(true);
    const saveSource = mode === "article" ? "manual_link" : "note";
    const saveKind = mode === "article" ? "link" : "note";
    const operationId = `${saveKind}:${Crypto.randomUUID()}`;
    analytics.capture("save_attempt_started", {
      save_source: saveSource,
      save_kind: saveKind,
      operation_id: operationId,
    });
    try {
      if (mode === "article") {
        await createLinkItem({
          url: link ?? trimmed,
          spaceId: pinnedSpaceId,
          operationId,
          analyticsSessionId: analytics.sessionId(),
          saveSource: "manual_link",
        });
      } else {
        await createNoteItem({
          text: trimmed,
          spaceId: pinnedSpaceId,
          operationId,
          analyticsSessionId: analytics.sessionId(),
        });
      }
      analytics.capture(mode === "article" ? "article_saved" : "note_saved");
      success();
    } catch (error) {
      analytics.capture("save_failed", {
        save_source: saveSource,
        save_kind: saveKind,
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

  const runImageRequests = useSaveImageBatch({
    spaceId: pinnedSpaceId,
    saveSource: "photo_import",
    paywallPlacement: PAYWALL_PLACEMENT,
    setBusy: setSaving,
    onAllSaved: (results) => {
      if (results.length > 0) {
        analytics.capture("images_saved", { image_count: results.length });
      }
      success();
    },
    onDismiss: dismiss,
    onUnexpectedError: (error) => {
      analytics.captureError("image_upload_failed", error);
      Alert.alert(t("errors.saveTitle"), t("errors.batchUpload"));
    },
  });

  const pickImages = () => pickAndSaveImages(runImageRequests);

  const isComposer = mode === "note" || mode === "article";
  const isArticle = mode === "article";
  const title = isArticle
    ? t("capture.articleTitle")
    : mode === "note"
      ? t("capture.noteTitle")
      : t("capture.title");

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
        <Stack.Title asChild>
          <AnimatedText text={title} style={styles.heading} truncate />
        </Stack.Title>
      ) : null}
      {Platform.OS === "android" ? (
        <AndroidAddHeader
          title={title}
          isComposer={isComposer}
          canSave={canSave}
          back={() => setMode("menu")}
          save={save}
        />
      ) : null}
      {isComposer && Platform.OS === "ios" ? (
        <>
          <Stack.Toolbar placement="left">
            <Stack.Toolbar.Button
              icon="chevron.left"
              tintColor={theme.colors.primary}
              onPress={() => setMode("menu")}
            >
              {t("common.back")}
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
      ) : null}

      {isComposer ? (
        <TextInput
          ref={inputRef}
          testID={isArticle ? "add-article-input" : "add-note-input"}
          style={isArticle ? styles.articleInput : styles.noteInput}
          value={value}
          onChangeText={setValue}
          placeholder={
            isArticle
              ? t("capture.linkPlaceholder")
              : t("capture.notePlaceholder")
          }
          placeholderTextColor={theme.colors.muted}
          autoFocus={Platform.OS !== "android"}
          multiline={!isArticle}
          autoCapitalize={isArticle ? "none" : "sentences"}
          autoCorrect={!isArticle}
          keyboardType={isArticle ? "url" : "default"}
          returnKeyType={isArticle ? "done" : "default"}
          onSubmitEditing={isArticle ? save : undefined}
          editable={!saving}
        />
      ) : null}
      {isComposer ? null : (
        <View style={styles.actions}>
          <ActionButton
            testID="add-option-note"
            icon="square.and.pencil"
            label={t("item.note")}
            onPress={() => guard(() => openComposer("note"))}
            disabled={saving || entitlementLoading}
          />
          <ActionButton
            testID="add-option-article"
            icon="link"
            label={t("item.article")}
            onPress={() => guard(() => openComposer("article"))}
            disabled={saving || entitlementLoading}
          />
          <ActionButton
            icon="photo.on.rectangle"
            label={t("capture.photos")}
            onPress={() => guard(pickImages)}
            disabled={saving || entitlementLoading}
          />
          <ActionButton
            icon="camera"
            label={t("capture.camera")}
            onPress={() =>
              guard(() => {
                openCamera(pinnedSpaceId);
              })
            }
            disabled={saving || entitlementLoading}
          />
        </View>
      )}
    </View>
  );
}

function AndroidAddSheet() {
  const router = useRouter();
  const { theme } = useUnistyles();
  const sheetRef = useRef<BottomSheetMethods>(null);
  const dismissActionRef = useRef<AndroidDismissAction>(null);

  const close = useCallback(() => {
    sheetRef.current?.close();
  }, []);

  const openCamera = useCallback((spaceId?: Id<"spaces">) => {
    dismissActionRef.current = { type: "camera", spaceId };
    sheetRef.current?.close();
  }, []);

  const finishDismiss = useCallback(() => {
    const action = dismissActionRef.current;
    if (action?.type === "camera") {
      router.replace({
        pathname: "/camera",
        params: action.spaceId ? { spaceId: action.spaceId } : {},
      });
      return;
    }
    router.back();
  }, [router]);

  return (
    <BottomSheet
      ref={sheetRef}
      index={0}
      enableDynamicSizing
      enablePanDownToClose
      onClose={finishDismiss}
      backgroundStyle={{ backgroundColor: theme.colors.background }}
    >
      <BottomSheetView>
        <AddContent close={close} openCamera={openCamera} />
      </BottomSheetView>
    </BottomSheet>
  );
}

export default function AddScreen() {
  const router = useRouter();

  if (Platform.OS === "android") {
    return <AndroidAddSheet />;
  }

  return (
    <AddContent
      close={() => router.back()}
      openCamera={(spaceId) => {
        router.back();
        router.push({
          pathname: "/camera",
          params: spaceId ? { spaceId } : {},
        });
      }}
    />
  );
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
  androidHeaderSpacer: {
    width: 40,
    height: 40,
  },
  actions: {
    flexDirection: "row",
    gap: theme.gap(1.25),
  },
  action: {
    flex: 1,
    alignItems: "center",
    gap: theme.gap(0.75),
  },
  actionIcon: {
    alignSelf: "stretch",
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionLabel: {
    fontFamily: theme.fonts.medium,
    fontSize: 12,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  noteInput: {
    fontFamily: theme.fonts.regular,
    fontSize: 18,
    color: theme.colors.foreground,
    minHeight: 120,
    maxHeight: Platform.OS === "android" ? 240 : undefined,
    padding: theme.gap(1.5),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: "top",
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
