import { t, useAppLocale } from "@/lib/i18n";
import { openPaywall } from "@/lib/entitlement";
import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type Props = {
  title: string;
  message: string;
  ctaLabel?: string;
  placement?: string;
  onPress?: () => void;
};

export function ProGate({
  title,
  message,
  ctaLabel = t("pro.viewPlans"),
  placement = "pro_gate",
  onPress,
}: Props) {
  useAppLocale();
  const router = useRouter();
  const handlePress = onPress ?? (() => openPaywall(router, placement));
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      <Pressable
        style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
        onPress={handlePress}
      >
        <Text style={styles.ctaText}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.gap(4),
    gap: theme.gap(1.5),
    backgroundColor: theme.colors.background,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    color: theme.colors.foreground,
  },
  message: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
    textAlign: "center",
  },
  cta: {
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    paddingVertical: theme.gap(1.75),
    paddingHorizontal: theme.gap(4),
    alignItems: "center",
    marginTop: theme.gap(1),
  },
  ctaText: {
    fontFamily: theme.fonts.bold,
    fontSize: 16,
    color: theme.colors.primaryForeground,
  },
}));
