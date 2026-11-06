import { AhaSharePractice } from "@/components/onboarding/aha-share";
import { ScreenTitle } from "@/components/screen-title";
import { ThemedText } from "@/components/ui/themed-text";
import { ahaSample } from "@/lib/aha-sample";
import { haptics } from "@/lib/haptics";
import { t, useAppLocale } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function HowToShare() {
  useAppLocale();
  const router = useRouter();
  const left = useRef(false);
  const pick = () => {
    if (left.current) return;
    left.current = true;
    void haptics.success();
    router.back();
  };
  return (
    <View style={styles.screen}>
      <ScreenTitle title={t("addSheet.howToShare")} />
      <View style={styles.body}>
        <ThemedText style={styles.lead}>{t("aha.shareTitle")}</ThemedText>
        <AhaSharePractice sample={ahaSample("trip", null)} onPick={pick} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: { flex: 1, backgroundColor: theme.colors.background },
  body: {
    flex: 1,
    gap: 16,
    paddingHorizontal: theme.gap(2.5),
    paddingBottom: rt.insets.bottom + theme.gap(2),
  },
  lead: { fontSize: 16.5, lineHeight: 22, color: theme.colors.muted },
}));
