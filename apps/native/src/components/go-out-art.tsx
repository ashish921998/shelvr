import { AppSymbolIcon } from "@/components/symbol";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function GoOutDice({ compact = false }: { compact?: boolean }) {
  const { theme } = useUnistyles();
  return (
    <View
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.frame, compact && styles.compactFrame]}
    >
      <View style={[styles.art, compact && styles.compactArt]}>
        <View style={styles.halo} />
        <View style={styles.mapCard}>
          <AppSymbolIcon
            name="map.fill"
            size={48}
            tintColor={theme.colors.primaryText}
          />
        </View>
        <View style={styles.die}>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
            <View
              key={index}
              style={[
                styles.pip,
                [0, 2, 4, 6, 8].includes(index) && styles.filledPip,
              ]}
            />
          ))}
        </View>
        <View style={styles.sparkle}>
          <AppSymbolIcon
            name="sparkles"
            size={25}
            tintColor={theme.colors.primaryText}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  frame: {
    width: 240,
    height: 210,
    alignItems: "center",
    justifyContent: "center",
  },
  compactFrame: { height: 150 },
  compactArt: { transform: [{ scale: 0.7 }] },
  art: { width: 240, height: 210, alignSelf: "center" },
  halo: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    left: 20,
    top: 5,
    backgroundColor: theme.colors.primarySoft,
  },
  mapCard: {
    position: "absolute",
    top: 27,
    right: 24,
    width: 116,
    height: 140,
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "13deg" }],
    boxShadow: "0 5px 14px rgba(43,36,24,0.08)",
  },
  die: {
    position: "absolute",
    left: 30,
    bottom: 24,
    width: 120,
    height: 120,
    padding: 22,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    flexDirection: "row",
    flexWrap: "wrap",
    alignContent: "space-between",
    justifyContent: "space-between",
    transform: [{ rotate: "-12deg" }],
    boxShadow: "0 8px 16px rgba(147,93,9,0.17)",
  },
  pip: { width: "28%", height: "28%", borderRadius: theme.radius.xl },
  filledPip: { backgroundColor: theme.colors.primaryForeground },
  sparkle: { position: "absolute", top: 10, right: 8 },
}));
