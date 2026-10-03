import { AppSymbolIcon } from "@/components/symbol";
import { t } from "@/lib/i18n";
import { readReelPlayerMessage, REEL_PLAYER_SCRIPT } from "@/lib/reel-player";
import { WebView } from "@expo/dom-webview";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

// The Done bar under a playing reel.
const DONE_BAR = 56;

/**
 * A media page's stage while its reel plays: the player between the header
 * (`top`) and a Done bar that sits `bottom` points above the page's foot.
 */
export function ReelStage({
  uri,
  top,
  bottom,
  onOpen,
  onFail,
  onDone,
}: {
  uri: string | undefined;
  top: number;
  bottom: number;
  onOpen: () => void;
  onFail: () => void;
  onDone: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View
      style={[
        styles.stage,
        { paddingTop: top, paddingBottom: bottom + DONE_BAR },
      ]}
    >
      <ReelPlayer
        uri={uri}
        style={styles.player}
        onOpen={onOpen}
        onFail={onFail}
      />
      <View style={[styles.doneBar, { bottom }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onDone}
          hitSlop={8}
          style={({ pressed }) => [
            styles.doneButton,
            pressed && { opacity: theme.opacity.pressed },
          ]}
        >
          <AppSymbolIcon name="xmark" size={12} tintColor="white" />
          <Text style={styles.doneText}>{t("common.done")}</Text>
        </Pressable>
      </View>
    </View>
  );
}

// How long the player may take to load before the post opens instead.
const READY_TIMEOUT_MS = 12_000;

type Props = {
  // The embed player's address (see reelEmbedUrl), or undefined while a
  // short link is still being followed.
  uri: string | undefined;
  style?: StyleProp<ViewStyle>;
  // A link inside the player was tapped.
  onOpen: () => void;
  // The player never loaded: the caller opens the post instead.
  onFail: () => void;
};

/**
 * Plays a reel inside the app through its site's own embed player. It uses
 * the DOM-components web view already in the app binary, so it ships without
 * a store build. A spinner shows until the page reports it has loaded.
 */
function ReelPlayer({ uri, style, onOpen, onFail }: Props) {
  const [ready, setReady] = useState<string | null>(null);
  const loaded = uri !== undefined && ready === uri;

  // The latest callback, so a parent re-render doesn't restart the clock.
  const failRef = useRef(onFail);
  useEffect(() => {
    failRef.current = onFail;
  }, [onFail]);
  useEffect(() => {
    if (loaded) return;
    const timer = setTimeout(() => failRef.current(), READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [loaded]);

  return (
    <View style={style}>
      {uri ? (
        <WebView
          source={{ uri }}
          style={[styles.web, { opacity: loaded ? 1 : 0 }]}
          containerStyle={styles.web}
          injectedJavaScript={REEL_PLAYER_SCRIPT}
          // The page is a third party's: it never gets the native modules.
          useExpoModulesBridge={false}
          onMessage={(e) => {
            const message = readReelPlayerMessage(e.nativeEvent.data);
            if (message === "ready") setReady(uri);
            else if (message === "open") onOpen();
            else if (message === "error") failRef.current();
          }}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          allowsPictureInPictureMediaPlayback={false}
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          bounces={false}
        />
      ) : null}
      {loaded ? null : (
        <View style={styles.spinner} pointerEvents="none">
          <ActivityIndicator size="large" color="white" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  stage: {
    flex: 1,
  },
  player: {
    flex: 1,
  },
  doneBar: {
    position: "absolute",
    left: 0,
    right: 0,
    height: DONE_BAR,
    alignItems: "center",
    justifyContent: "center",
  },
  doneButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: theme.gap(2),
    borderRadius: 50,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
  },
  doneText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: "white",
  },
  web: {
    flex: 1,
    backgroundColor: "black",
  },
  spinner: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
}));
