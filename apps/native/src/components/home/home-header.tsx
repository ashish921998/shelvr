import { HeaderIconButton } from "@/components/ui/header-icon-button";
import { Wordmark } from "@/components/wordmark";
import { t, useAppLocale } from "@/lib/i18n";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function HomeHeader({ children }: { children?: ReactNode }) {
  useAppLocale();
  const router = useRouter();
  return (
    <View style={styles.row}>
      <Wordmark size={28} />
      <View style={styles.middle}>{children}</View>
      <HeaderIconButton
        icon="person.fill"
        label={t("navigation.profile")}
        onPress={() => router.push("/profile")}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(2),
    paddingTop: theme.gap(1),
    paddingBottom: theme.gap(2),
  },
  middle: { flex: 1, minWidth: 0 },
}));
