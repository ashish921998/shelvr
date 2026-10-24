import { analytics } from "@/lib/analytics";
import { DomWebView } from "@expo/dom-webview";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// Runs inside Instagram's embed page, which only builds its player on a tap: it reads the reel's video
// address from the page data, plays it muted and full-bleed, and says "playing" once frames are on screen,
// "missing" when the page has no video address, and "failed" when the video cannot play.
const PLAY_FULL_BLEED = `(function () {
  var found = /video_url\\\\*"\\s*:\\s*\\\\*"(.*?)\\\\*"/.exec(document.documentElement.innerHTML);
  if (!found) {
    window.ReactNativeWebView.postMessage("missing");
    return;
  }
  var src = found[1].replace(/\\\\/g, "").replace(/u0026/g, "&");
  var video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:2147483647";
  video.addEventListener("playing", function () {
    window.ReactNativeWebView.postMessage("playing");
  }, { once: true });
  video.addEventListener("error", function () {
    window.ReactNativeWebView.postMessage("failed");
  });
  document.body.appendChild(video);
  video.play();
})(); true;`;

/** A real Instagram reel playing muted behind the reel's drawn rail. It stays hidden until it plays, so a missing or slow reel leaves the photo underneath, and `onPlaying` says whether it is on screen; touches never reach it. */
export function ReelVideo({
  reelCode,
  onPlaying,
}: {
  reelCode: string;
  onPlaying: (playing: boolean) => void;
}) {
  const [playing, setPlaying] = useState(false);
  const show = (next: boolean) => {
    setPlaying(next);
    onPlaying(next);
  };
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
        injectedJavaScript={PLAY_FULL_BLEED}
        onMessage={(event) => {
          const message = event.nativeEvent.data;
          if (message === "playing") return show(true);
          if (message !== "missing" && message !== "failed") return;
          show(false);
          analytics.captureError(
            "onboarding_reel_unavailable",
            new Error(message),
            { reason: message },
          );
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
