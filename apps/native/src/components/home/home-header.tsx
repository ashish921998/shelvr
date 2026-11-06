import { AppSymbolIcon } from "@/components/symbol";
import { Wordmark } from "@/components/wordmark";
import { withAlpha } from "@/lib/color";
import { t, useAppLocale } from "@/lib/i18n";
import { useRouter } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function HomeHeader({ children }: { children?: ReactNode }) {
  useAppLocale();
  const router = useRouter();
  const { theme } = useUnistyles();
  return (
    <View style={styles.row}>
      <Wordmark size={30} />
      <View style={styles.middle}>{children}</View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("navigation.profile")}
        onPress={() => router.push("/profile")}
        style={({ pressed }) => [styles.avatar, pressed && styles.pressed]}
      >
        <AppSymbolIcon
          name="person.fill"
          size={17}
          tintColor={theme.colors.muted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    height: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: theme.gap(2.5),
    marginTop: theme.gap(1),
    marginBottom: theme.gap(1.25),
  },
  middle: { flex: 1, minWidth: 0 },
  avatar: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
    borderWidth: 2.5,
    borderColor: withAlpha(theme.colors.primary, 0.45),
    backgroundColor: theme.colors.surfaceMuted,
  },
  pressed: { opacity: theme.opacity.pressed },
}));
