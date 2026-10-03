import { AppSymbolIcon } from "@/components/symbol";
import { t } from "@/lib/i18n";
import type { ReactNode } from "react";
import { type GestureResponderEvent, Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** A post's image or video poster that opens the post on its site, or plays
 * it where the caller can (the media viewer). Videos get a play button. */
export function PostMediaButton({
  site,
  label,
  playable,
  onPress,
  onPressIn,
  children,
}: {
  site: string;
  // Replaces "Open {site}" for a poster that does something else.
  label?: string;
  playable: boolean;
  onPress: (e: GestureResponderEvent) => void;
  onPressIn?: (e: GestureResponderEvent) => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? t("item.openSite", { site })}
      onPress={onPress}
      onPressIn={onPressIn}
    >
      {children}
      {playable ? (
        <View style={styles.playOverlay} pointerEvents="none">
          <View style={styles.playButton}>
            <AppSymbolIcon name="play.fill" size={26} tintColor="white" />
          </View>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  playOverlay: {
    position: "absolute",
    inset: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    // Nudge the glyph to the optical center of the circle.
    paddingLeft: 4,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.5)",
  },
});
