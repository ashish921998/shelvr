import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function ProgressBar({ value }: { value: number }) {
  const share = Math.max(0, Math.min(1, value));
  return (
    <View style={styles.track}>
      <View style={[styles.fill, { width: `${share * 100}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  track: {
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceMuted,
  },
  fill: { height: 6, borderRadius: 3, backgroundColor: theme.colors.keep },
}));
