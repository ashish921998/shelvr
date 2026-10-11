import { t, useAppLocale } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { ThemedText } from "@/components/ui/themed-text";
import { GhostButton } from "@/components/onboarding/parts";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** Creation has not returned an item ID: do not imply a confirmed save. */
export function SubmissionRecovery({
  onKeepWaiting,
  onContinue,
}: {
  onKeepWaiting: () => void;
  onContinue: () => void;
}) {
  useAppLocale();
  return (
    <View style={styles.wrap}>
      <ThemedText variant="title">{t("demo.submissionTitle")}</ThemedText>
      <ThemedText variant="body" style={styles.description}>
        {t("demo.submissionUnconfirmed")}
      </ThemedText>
      <View style={styles.actions}>
        <Button title={t("demo.keepWaiting")} onPress={onKeepWaiting} />
        <GhostButton label={t("common.continue")} onPress={onContinue} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: { flex: 1, justifyContent: "center", gap: theme.gap(2) },
  description: { color: theme.colors.muted },
  actions: { gap: theme.gap(1.5) },
}));
