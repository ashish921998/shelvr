import { useClipboardInvite } from "@/lib/clipboard-invite";
import { t } from "@/lib/i18n";
import { useRouter } from "expo-router";
import { useRef } from "react";
import { Alert, Pressable, Text } from "react-native";
import { StyleSheet } from "react-native-unistyles";

export function InviteOffer() {
  const router = useRouter();
  const invite = useClipboardInvite();
  const reading = useRef(false);
  if (!invite.offered) return null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (reading.current) return;
        reading.current = true;
        void invite.take().then((token) => {
          reading.current = false;
          if (token !== null) router.push(`/list-invite/${token}`);
          else {
            Alert.alert(
              t("onboarding.noInviteTitle"),
              t("onboarding.noInviteBody"),
            );
          }
        });
      }}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <Text style={styles.text}>
        {t("onboarding.invitedToList")}{" "}
        <Text style={styles.link}>{t("onboarding.joinList")}</Text>
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: 44,
    paddingVertical: theme.gap(0.5),
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: {
    opacity: theme.opacity.pressed,
  },
  text: {
    ...theme.type.footnote,
    color: theme.colors.muted,
    textAlign: "center",
  },
  link: {
    fontFamily: theme.fonts.bold,
    color: theme.colors.foreground,
  },
}));
