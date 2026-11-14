import { ThemedText } from "@/components/ui/themed-text";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native-unistyles";

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <ThemedText variant="title" accessibilityRole="header" style={styles.text}>
      {children}
    </ThemedText>
  );
}

const styles = StyleSheet.create({ text: { fontSize: 20, lineHeight: 26 } });
