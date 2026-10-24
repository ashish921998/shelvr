import { CITY_PICTURES } from "@/components/onboarding/city-pictures";
import { useLargeText } from "@/lib/use-large-text";
import { Image } from "expo-image";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** Where each photo sits, as fractions of the collage, and how far it leans. */
const CARDS = [
  { picture: CITY_PICTURES.lisbon.view, left: 0.02, top: 0.08, turn: -8 },
  { picture: CITY_PICTURES.paris.food, left: 0.5, top: 0.0, turn: 7 },
  { picture: CITY_PICTURES.tokyo.view, left: 0.08, top: 0.48, turn: 5 },
  { picture: CITY_PICTURES["new-york"].food, left: 0.52, top: 0.42, turn: -6 },
] as const;

/**
 * Tilted city photos behind the opener and sign-in. Decorative only: it takes
 * the room left over, shrinks to nothing when there is none, and steps aside
 * for large text so the buttons stay on screen.
 */
export function PhotoCollage() {
  if (useLargeText()) return null;
  return (
    <View
      style={styles.collage}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {CARDS.map((card, index) => (
        <View
          key={index}
          style={[
            styles.card,
            {
              left: `${card.left * 100}%`,
              top: `${card.top * 100}%`,
              transform: [{ rotate: `${card.turn}deg` }],
            },
          ]}
        >
          <Image
            source={card.picture}
            contentFit="cover"
            style={styles.photo}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  collage: {
    flex: 1,
  },
  card: {
    position: "absolute",
    width: "44%",
    height: "50%",
    padding: 6,
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.frame,
    boxShadow: "0 8px 24px rgba(43, 36, 24, 0.18)",
  },
  photo: {
    flex: 1,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
  },
}));
