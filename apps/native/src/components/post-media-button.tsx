import { AppSymbolIcon } from "@/components/symbol";
import { t } from "@/lib/i18n";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** A post's image or video poster that opens the post on its site. Videos
 * get a play button because the app cannot play them itself. */
export function PostMediaButton({
  site,
  playable,
  onPress,
  children,
}: {
  site: string;
  playable: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t("item.openSite", { site })}
      onPress={onPress}
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
