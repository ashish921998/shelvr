import { t, useAppLocale } from "@/lib/i18n";
import { AnimatedText } from "@/components/animated-text";
import {
  BottomSheet,
  BottomSheetView,
  type BottomSheetMethods,
} from "@expo/ui/community/bottom-sheet";
import { parseExifDate } from "@/lib/date";
import { resolvePickedImageLocation } from "@/lib/picked-image-location";
import { openPaywall, usePaywallGuard } from "@/lib/entitlement";
import { useSaveImageBatch } from "@/lib/use-save-image-batch";
import { saveErrorCode } from "@convex/model/saveErrors";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { useMutation } from "convex/react";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { TypeMark } from "@/components/ink/type-mark";
import { displayHost } from "@/lib/url";
import type { MarkKind } from "@/lib/ink/strokes";
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
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";

type Mode = "menu" | "note" | "article";
type AndroidDismissAction = { type: "camera"; spaceId?: Id<"spaces"> } | null;

/** Shared by the up-front guard and by the server's `pro_required` refusal, so
 * both land in the same paywall funnel. */
const PAYWALL_PLACEMENT = "add";

/** Read a link from the clipboard for the article prefill. `getUrlAsync` is
 * iOS-only, so Android reads the raw string and keeps it only when it parses as
 * an http(s) URL. A failed read resolves to null instead of rejecting. */
async function readClipboardUrl(): Promise<string | null> {
  try {
    if (Platform.OS === "ios") {
      return (await Clipboard.getUrlAsync()) ?? null;
    }
    const text = (await Clipboard.getStringAsync()).trim();
    if (text === "") return null;
    return new URL(text).protocol.startsWith("http") ? text : null;
  } catch {
    return null;
  }
}

function ActionButton({
  mark,
  label,
  onPress,
  disabled,
}: {
  mark: MarkKind;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      // Keyed by the mark rather than the label: the label is localized copy.
      testID={`add-${mark}`}
      style={[styles.action, disabled && { opacity: 0.4 }]}
    >
      <View style={styles.actionIcon}>
        <TypeMark kind={mark} size={34} />
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
  // Opened from inside a space: everything saved here is pre-pinned to it.
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  const pinnedSpaceId = spaceId as Id<"spaces"> | undefined;
  const [mode, setMode] = useState<Mode>("menu");
  const [saving, setSaving] = useState(false);
  const [value, setValue] = useState("");

  const createLinkItem = useMutation(api.items.createLinkItem);
  const createNoteItem = useMutation(api.items.createNoteItem);
  // Saving is Pro — route to the paywall before composing if not entitled.
  const { guard, loading: entitlementLoading } =
    usePaywallGuard(PAYWALL_PLACEMENT);

  const trimmed = value.trim();
  const canSave = trimmed.length > 0 && !saving;

  // A link already on the clipboard is offered on the picker and prefilled
  // into the article field, so it is caught rather than retyped.
  const [clipboardUrl, setClipboardUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    readClipboardUrl().then((url) => {
      if (!active || !url) return;
      setClipboardUrl(url);
      if (mode === "article") setValue((current) => current || url);
    });
    return () => {
      active = false;
    };
  }, [mode]);

  const success = () => {
    if (process.env.EXPO_OS === "ios") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    close();
  };

  const openComposer = (next: Mode) => {
    setValue("");
    setMode(next);
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (mode === "article") {
        await createLinkItem({
          url: trimmed,
          spaceId: pinnedSpaceId,
          analyticsSessionId: analytics.sessionId(),
        });
      } else {
        await createNoteItem({
          text: trimmed,
          spaceId: pinnedSpaceId,
          analyticsSessionId: analytics.sessionId(),
        });
      }
      analytics.capture(mode === "article" ? "article_saved" : "note_saved");
      success();
    } catch (error) {
      setSaving(false);
      // Pro can lapse while the composer is open. The paywall is the only
      // useful next step, so show it instead of a generic failure alert.
      if (saveErrorCode(error) === "pro_required") {
        await openPaywall(router, PAYWALL_PLACEMENT);
        return;
      }
      Alert.alert(t("errors.saveTitle"), t("errors.tryAgain"));
    }
  };

  // Runs a batch of image requests, closing on success or reporting a partial
  // outcome. The hook owns the retry (which replays each failed request's
  // operation id rather than minting a new one), the `pro_required` paywall
  // route, and the partial-failure alert.
  const runImageRequests = useSaveImageBatch({
    spaceId: pinnedSpaceId,
    paywallPlacement: PAYWALL_PLACEMENT,
    setBusy: setSaving,
    onAllSaved: (results) => {
      // Empty when there was nothing to save, which is not a save event.
      if (results.length > 0) {
        analytics.capture("images_saved", { image_count: results.length });
      }
      success();
    },
    onDismiss: close,
    onUnexpectedError: (error) => {
      analytics.captureError("image_upload_failed", error);
      Alert.alert(t("errors.saveTitle"), t("errors.batchUpload"));
    },
  });

  const pickImages = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 0.8,
      exif: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    await runImageRequests(
      await Promise.all(
        result.assets.map(async (asset) => ({
          image: {
            uri: asset.uri,
            width: asset.width,
            height: asset.height,
            mimeType: asset.mimeType,
            capturedAt: parseExifDate(asset.exif),
            ...(await resolvePickedImageLocation(asset)),
          },
        })),
      ),
    );
  };

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
      {/* Each platform mounts exactly one persistent title so changes cascade
          between "Save something" / "New note" / "Save an article". */}
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
          style={isArticle ? styles.articleInput : styles.noteInput}
          value={value}
          onChangeText={setValue}
          placeholder={
            isArticle
              ? t("capture.linkPlaceholder")
              : t("capture.notePlaceholder")
          }
          placeholderTextColor={theme.colors.muted}
          autoFocus
          multiline={!isArticle}
          autoCapitalize={isArticle ? "none" : "sentences"}
          autoCorrect={!isArticle}
          keyboardType={isArticle ? "url" : "default"}
          returnKeyType={isArticle ? "done" : "default"}
          onSubmitEditing={isArticle ? save : undefined}
          editable={!saving}
        />
      ) : (
        <>
          {clipboardUrl ? (
            <Pressable
              style={styles.catch}
              onPress={() => guard(() => openComposer("article"))}
              disabled={saving || entitlementLoading}
              accessibilityRole="button"
              accessibilityLabel={t("home.pasteLink")}
              testID="clipboard-catch"
            >
              <TypeMark kind="article" size={22} />
              <View style={styles.catchCopy}>
                <Text style={styles.catchLabel}>{t("home.pasteLink")}</Text>
                <Text style={styles.catchHost} numberOfLines={1}>
                  {displayHost(clipboardUrl)}
                </Text>
              </View>
            </Pressable>
          ) : null}
          <View style={styles.actions}>
            <ActionButton
              mark="note"
              label={t("item.note")}
              onPress={() => guard(() => openComposer("note"))}
              disabled={saving || entitlementLoading}
            />
            <ActionButton
              mark="article"
              label={t("item.article")}
              onPress={() => guard(() => openComposer("article"))}
              disabled={saving || entitlementLoading}
            />
            <ActionButton
              mark="photo"
              label={t("capture.photos")}
              onPress={() => guard(pickImages)}
              disabled={saving || entitlementLoading}
            />
            <ActionButton
              mark="camera"
              label={t("capture.camera")}
              onPress={() =>
                guard(() => {
                  openCamera(pinnedSpaceId);
                })
              }
              disabled={saving || entitlementLoading}
            />
          </View>
        </>
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
    justifyContent: "center",
    // Tighter than before: the four ways in are cards now, so they read as
    // one row rather than four separate icons.
    gap: theme.gap(1.25),
  },
  // The clipboard catch: a link already copied, offered before the tiles.
  catch: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.25),
    marginBottom: theme.gap(1.5),
    padding: theme.gap(1.5),
    borderRadius: 14,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surfaceMuted,
  },
  catchCopy: { flex: 1 },
  catchLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  catchHost: {
    fontFamily: theme.fonts.regular,
    fontSize: 12,
    color: theme.colors.muted,
  },
  action: {
    flex: 1,
    alignItems: "center",
    gap: theme.gap(0.75),
    minWidth: 64,
    paddingVertical: theme.gap(1.5),
    borderRadius: 14,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  actionIcon: { alignItems: "center", justifyContent: "center" },
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
