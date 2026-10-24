import { analytics } from "@/lib/analytics";
import { REEL_PLAYER_SCRIPT } from "@/components/onboarding/reel-player-script";
import { DomWebView } from "@expo/dom-webview";
import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** How long the embed page gets to say anything before the reel counts as unavailable (a page that never loads says nothing). */
const ANSWER_MS = 15_000;

type Reason = "missing" | "failed" | "timeout";

function reportUnavailable(reason: Reason) {
  analytics.captureError("onboarding_reel_unavailable", new Error(reason), {
    reason,
  });
}

/** A real Instagram reel playing muted behind the reel's drawn rail. It stays hidden until it plays, so a missing or slow reel leaves the photo underneath, and `onPlaying` says whether it is on screen; touches never reach it. */
export function ReelVideo({
  reelCode,
  onPlaying,
}: {
  reelCode: string;
  onPlaying: (playing: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const answered = useRef(false);
  const show = (next: boolean) => {
    setPlaying(next);
    onPlaying(next);
  };
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!answered.current) reportUnavailable("timeout");
    }, ANSWER_MS);
    return () => clearTimeout(timer);
  }, []);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, !playing && styles.hidden]}
    >
      <DomWebView
        source={{ uri: `https://www.instagram.com/reel/${reelCode}/embed/` }}
        style={styles.web}
        scrollEnabled={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsPictureInPictureMediaPlayback={false}
        injectedJavaScript={REEL_PLAYER_SCRIPT}
        onMessage={(event) => {
          const message = event.nativeEvent.data;
          if (message === "playing") {
            answered.current = true;
            return show(true);
          }
          if (message !== "missing" && message !== "failed") return;
          answered.current = true;
          show(false);
          reportUnavailable(message);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    opacity: 0,
  },
  web: {
    flex: 1,
    backgroundColor: "#000000",
  },
});
