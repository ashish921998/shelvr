import { DomWebView } from "@expo/dom-webview";
import { useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

// Runs inside Instagram's embed page, which only builds its player on a tap: it reads the reel's video
// address from the page data, plays it muted and full-bleed, and says "playing" once frames are on screen.
const PLAY_FULL_BLEED = `(function () {
  var found = /video_url\\\\*"\\s*:\\s*\\\\*"(.*?)\\\\*"/.exec(document.documentElement.innerHTML);
  if (!found) return;
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
  document.body.appendChild(video);
  video.play();
})(); true;`;

/** A real Instagram reel playing muted behind the reel's drawn rail. It stays hidden until it plays, so a missing or slow reel leaves the photo underneath; touches never reach it. */
export function ReelVideo({ reelCode }: { reelCode: string }) {
  const [playing, setPlaying] = useState(false);
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
          if (event.nativeEvent.data === "playing") setPlaying(true);
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
