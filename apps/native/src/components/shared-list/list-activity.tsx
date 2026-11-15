import { ThemedText } from "@/components/ui/themed-text";
import { fadeIn } from "@/lib/motion";
import { activityLine, type SharedListDetail } from "@/lib/shared-lists";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

export function ListActivity({
  newFrom,
}: {
  newFrom: SharedListDetail["newFrom"];
}) {
  const line = activityLine(newFrom);
  if (line === null) return null;
  return (
    <Animated.View key={line} entering={fadeIn}>
      <ThemedText
        variant="subheadLabel"
        style={styles.line}
        testID="shared-list-activity"
      >
        {line}
      </ThemedText>
    </Animated.View>
  );
}

const styles = StyleSheet.create((theme) => ({
  line: { color: theme.colors.primaryText },
}));
