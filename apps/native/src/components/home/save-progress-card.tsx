import { t, useAppLocale } from "@/lib/i18n";
import { InlineCard } from "@/components/ui/inline-card";
import { CtaButton } from "@/components/onboarding/parts";
import { useRouter } from "expo-router";
import { Text, View } from "react-native";
import { Pressable } from "react-native-gesture-handler";
import { StyleSheet } from "react-native-unistyles";

/**
 * The "save your next two" card on Home: how far a new shelf is from its
 * first three real saves. Purely presentational; Home decides when it shows.
 */
export function SaveProgressCard({
  saved,
  goal,
  onDismiss,
}: {
  saved: number;
  goal: number;
  onDismiss: () => void;
}) {
  useAppLocale();
  const router = useRouter();
  const count = t("home.progressCount", { saved, total: goal });
  return (
    <InlineCard
      testID="save-progress-card"
      title={t("home.progressTitle")}
      body={t("home.progressBody")}
    >
      <View style={styles.progress} accessible accessibilityLabel={count}>
        <View style={styles.dots}>
          {Array.from({ length: goal }, (_, index) => (
            <View
              key={index}
              style={[styles.dot, index < saved && styles.dotFilled]}
            />
          ))}
        </View>
        <Text style={styles.count}>{count}</Text>
      </View>
      <CtaButton
        label={t("home.progressAdd")}
        onPress={() => router.push("/add")}
      />
      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.notNow")}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onDismiss}
        >
          <Text style={styles.secondaryButtonText}>{t("common.notNow")}</Text>
        </Pressable>
      </View>
    </InlineCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    marginVertical: theme.gap(0.5),
  },
  dots: {
    flexDirection: "row",
    gap: theme.gap(0.5),
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dotFilled: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  count: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
