// The small standing save: the same object as a card, shrunk to a thumbnail
// for a shelf row in a list (the Shelves tab, Tidy's "Shelved" row). Small
// enough that it carries no type mark — the row's own mark says what the shelf
// holds.

import { Image } from "expo-image";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { SuggestedBadge } from "@/components/suggested-badge";

export function ShelfThumbnail({
  imageUrl,
  size = 38,
  suggested = false,
  tilt = 0,
}: {
  imageUrl?: string;
  size?: number;
  suggested?: boolean;
  tilt?: number;
}) {
  return (
    <View
      style={[
        styles.matte,
        {
          width: size,
          height: size * 1.18,
          transform: [{ rotate: `${tilt}deg` }],
        },
      ]}
    >
      {imageUrl ? (
        <Image
          source={{ uri: imageUrl }}
          style={styles.image}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.image, styles.blank]} />
      )}
      {suggested ? (
        <View style={styles.badge} pointerEvents="none">
          <SuggestedBadge size={20} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  matte: {
    backgroundColor: "#ffffff",
    borderRadius: 4,
    padding: 2,
    transformOrigin: "bottom center",
    shadowColor: "#2b2418",
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  image: { flex: 1, borderRadius: 3 },
  blank: { backgroundColor: theme.colors.surfaceMuted },
  badge: { position: "absolute", top: -6, right: -6 },
}));
