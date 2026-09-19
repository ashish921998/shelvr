import { t, useAppLocale, localizeError } from "@/lib/i18n";
import { parseExifDate } from "@/lib/date";
import { resolvePickedImageLocation } from "@/lib/picked-image-location";
import {
  type ImageSaveRequest,
  reportSaveFailures,
  useSaveImages,
} from "@/lib/use-save-image";
import { useSaveImageBatch } from "@/lib/use-save-image-batch";
import type { Id } from "@convex/_generated/dataModel";
import { openPaywall } from "@/lib/entitlement";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { InkIcon } from "@/components/ink/ink-icon";
import { TypeMark } from "@/components/ink/type-mark";
import { INK_A11Y } from "@/components/ink/ink-canvas";
import { PrimaryButton, SecondaryButton } from "@/components/shelf/ink-button";
import { ScreenHeader } from "@/components/shelf/screen-header";
import { Display } from "@/components/shelf/typography";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { useInkClock } from "@/lib/ink/use-ink-clock";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet } from "react-native-unistyles";
import { analytics } from "@/lib/analytics";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from "react-native-vision-camera";
import { isAvailable as stickerLiftAvailable, liftSubject } from "subject-lift";

type CaptureMode = "photo" | "sticker";

// The accent color matches theme.colors.primary (identical in both themes).
const ACCENT = "#e6a23c";
const INACTIVE = "rgba(255,255,255,0.55)";

/** This screen is only reachable through add.tsx's entitlement guard, so a
 * `pro_required` refusal here means Pro lapsed mid-session. There is no client
 * gate to fall back on — route straight to the paywall. */
const PAYWALL_PLACEMENT = "camera";

export default function CameraScreen() {
  useAppLocale();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // Opened from a space's add flow: captures are pre-pinned to that space.
  const { spaceId } = useLocalSearchParams<{ spaceId?: string }>();
  const pinnedSpace = { spaceId: spaceId as Id<"spaces"> | undefined };
  const { hasPermission, requestPermission } = useCameraPermission();
  const [position, setPosition] = useState<"back" | "front">("back");
  const device = useCameraDevice(position);
  const photoOutput = usePhotoOutput();
  const saveImages = useSaveImages();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<CaptureMode>("photo");
  const clock = useInkClock();

  // Slides the active-label highlight between Photo (0) and Sticker (1).
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(mode === "sticker" ? 1 : 0, { duration: 200 });
  }, [mode, progress]);

  const switchMode = useCallback((next: CaptureMode) => {
    if (next === "sticker" && !stickerLiftAvailable) return;
    setMode((current) => {
      if (current !== next && process.env.EXPO_OS === "ios") {
        Haptics.selectionAsync();
      }
      return next;
    });
  }, []);

  // Horizontal swipe over the preview toggles modes (iOS-camera style). The
  // activeOffsetX keeps taps and vertical drags from triggering it.
  const swipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .onEnd((event) => {
          "worklet";
          if (event.translationX < -40) runOnJS(switchMode)("sticker");
          else if (event.translationX > 40) runOnJS(switchMode)("photo");
        }),
    [switchMode],
  );

  const photoLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [ACCENT, INACTIVE]),
  }));
  const stickerLabelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(progress.value, [0, 1], [INACTIVE, ACCENT]),
  }));

  // Runs a batch, closing on success or reporting a partial outcome. The hook
  // owns the retry (failed requests keep their operation ids so it resubmits
  // only them), the `pro_required` paywall route, and the alert.
  const runImageRequests = useSaveImageBatch({
    spaceId: pinnedSpace.spaceId,
    paywallPlacement: PAYWALL_PLACEMENT,
    setBusy,
    onAllSaved: () => router.back(),
    onDismiss: () => router.back(),
    onUnexpectedError: () => {
      Alert.alert(t("errors.saveTitle"), t("errors.upload"));
    },
  });

  const pickFromLibrary = async () => {
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

  // Saves a single already-built request (used for the initial capture AND for
  // a retry), reusing the request's operation id verbatim. A retry never
  // re-captures or mints a fresh id — it replays the exact failed request so
  // the backend idempotency ledger resumes it.
  const saveSingle = async (request: ImageSaveRequest) => {
    setBusy(true);
    try {
      const [result] = await saveImages([request], pinnedSpace);
      if (result.status === "saved") {
        analytics.capture("photo_captured", { capture_mode: mode });
        router.back();
        return;
      }
      reportSaveFailures([result]);
      if (result.code === "pro_required") {
        setBusy(false);
        await openPaywall(router, PAYWALL_PLACEMENT);
        return;
      }
      // Preserve the failed request (with its operation id) so the in-screen
      // retry replays it instead of generating a new one.
      const failed = { image: result.image, operationId: result.operationId };
      Alert.alert(
        t("errors.captureTitle"),
        localizeError(result.message, "errors.savePhoto"),
        [
          {
            text: t("common.retry"),
            onPress: () => {
              void saveSingle(failed);
            },
          },
          { text: t("common.cancel"), onPress: () => setBusy(false) },
        ],
      );
      setBusy(false);
    } catch {
      Alert.alert(t("errors.captureTitle"), t("errors.savePhoto"));
      setBusy(false);
    }
  };

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (process.env.EXPO_OS === "ios") {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      }
      const photoFile = await photoOutput.capturePhotoToFile({}, {});
      const uri = `file://${photoFile.filePath}`;

      let request: ImageSaveRequest;
      if (mode === "sticker") {
        const sticker = await liftSubject(uri);
        if (!sticker.hasSubject) {
          Alert.alert(t("capture.noSubjectTitle"), t("capture.noSubjectBody"));
          setBusy(false);
          return;
        }
        request = {
          image: {
            uri: sticker.uri,
            width: sticker.width,
            height: sticker.height,
            mimeType: "image/png",
            isSticker: true,
          },
        };
      } else {
        request = { image: { uri } };
      }
      await saveSingle(request);
    } catch {
      Alert.alert(t("errors.captureTitle"), t("errors.takePhoto"));
      setBusy(false);
    }
  };

  // With no camera there is no viewfinder to darken for, so the fallback is
  // an ordinary paper screen: the camera mark, a headline, and the two ways
  // out. The dark chrome belongs to the live preview only.
  const renderFallback = (
    title: string,
    message: string,
    action?: React.ReactNode,
  ) => (
    <View style={styles.fallback}>
      <ScreenHeader
        clock={clock}
        title={t("capture.camera")}
        left={
          <HeaderIconButton
            icon="xmark"
            label={t("common.close")}
            onPress={() => router.back()}
          />
        }
      />
      <View style={styles.fallbackBody}>
        <View {...INK_A11Y}>
          <TypeMark kind="camera" size={52} clock={clock} />
        </View>
        <Display style={styles.fallbackTitle}>{title}</Display>
        <Text style={styles.fallbackMessage}>{message}</Text>
        {action}
        <SecondaryButton
          label={t("capture.pickFromLibrary")}
          onPress={() => void pickFromLibrary()}
        />
      </View>
    </View>
  );

  let body: React.ReactNode;
  if (!hasPermission) {
    body = renderFallback(
      t("capture.cameraAccessTitle"),
      t("capture.cameraAccessBody"),
      <PrimaryButton
        label={t("permissions.allowCamera")}
        onPress={() => void requestPermission()}
      />,
    );
  } else if (device == null) {
    body = renderFallback(
      t("capture.noCameraTitle"),
      t("capture.noCameraBody"),
    );
  } else {
    body = (
      <Camera
        isActive
        device={device}
        outputs={[photoOutput]}
        style={styles.camera}
        resizeMode="cover"
      />
    );
  }

  const showControls = hasPermission && device;

  return (
    <View style={styles.container}>
      <GestureDetector gesture={swipe}>
        <View style={styles.preview}>{body}</View>
      </GestureDetector>

      {/* The dark overlay chrome belongs to the live preview. The fallback
          is a paper screen and carries its own header, so this whole bar
          stays off when there is nothing to look through. */}
      {showControls ? (
        <>
          <View style={[styles.topBar, { top: insets.top + 8 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("common.close")}
              style={styles.roundButton}
              onPress={() => router.back()}
            >
              <InkIcon name="xmark" size={18} tint="#fff" clock={clock} />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("capture.flipCamera")}
              style={styles.roundButton}
              onPress={() =>
                setPosition((p) => (p === "back" ? "front" : "back"))
              }
            >
              <InkIcon
                name="arrow.2.circlepath"
                size={18}
                tint="#fff"
                seed={1}
                clock={clock}
              />
            </Pressable>
          </View>

          {stickerLiftAvailable ? (
            <View
              style={[styles.modeSelector, { bottom: insets.bottom + 118 }]}
            >
              <Pressable hitSlop={10} onPress={() => switchMode("photo")}>
                <Animated.Text style={[styles.modeLabel, photoLabelStyle]}>
                  {t("capture.photoMode")}
                </Animated.Text>
              </Pressable>
              <Pressable hitSlop={10} onPress={() => switchMode("sticker")}>
                <Animated.Text style={[styles.modeLabel, stickerLabelStyle]}>
                  {t("capture.stickerMode")}
                </Animated.Text>
              </Pressable>
            </View>
          ) : null}

          <View style={[styles.bottomBar, { bottom: insets.bottom + 24 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("capture.pickFromLibrary")}
              style={styles.libraryButton}
              onPress={pickFromLibrary}
              disabled={busy}
            >
              <InkIcon
                name="photo.on.rectangle"
                size={20}
                tint="#fff"
                seed={2}
                clock={clock}
              />
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t("capture.shutter")}
              accessibilityState={{ busy, disabled: busy }}
              style={styles.shutter}
              onPress={capture}
              disabled={busy}
            >
              {/* Working is shown by the shutter closing in on itself, not by
                  a spinner. */}
              <View style={[styles.shutterInner, busy && styles.shutterBusy]} />
            </Pressable>
            <View style={styles.libraryButton} />
          </View>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  preview: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  topBar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  roundButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  modeSelector: {
    position: "absolute",
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(3),
  },
  modeLabel: {
    fontFamily: theme.fonts.bold,
    fontSize: 13,
    letterSpacing: 1.5,
  },
  bottomBar: {
    position: "absolute",
    left: 32,
    right: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  libraryButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutter: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 12px rgba(0,0,0,0.4)",
  },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    borderWidth: 3,
    borderColor: theme.colors.primary,
    backgroundColor: "#fff",
  },
  shutterBusy: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  fallback: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  fallbackBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(4),
    paddingBottom: theme.gap(6),
    gap: theme.gap(1.5),
  },
  fallbackTitle: { textAlign: "center", marginTop: theme.gap(1) },
  fallbackMessage: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
    textAlign: "center",
    marginBottom: theme.gap(1),
  },
}));
