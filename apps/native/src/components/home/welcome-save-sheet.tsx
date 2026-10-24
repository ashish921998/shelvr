import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { useWelcomeSheetVisible, welcomeSave } from "@/lib/welcome-save";
import { PillButton } from "@/components/onboarding/parts";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { useEffect, useRef } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** The one-time letter a new account opens Home to. */
export function WelcomeSaveSheet({
  userId,
  ready,
  trialEndsAt,
}: {
  userId: string;
  ready: boolean;
  trialEndsAt?: number;
}) {
  useAppLocale();
  const visible = useWelcomeSheetVisible(userId, ready);
  const trial = trialEndsAt !== undefined;

  const shownRef = useRef(false);
  useEffect(() => {
    if (!visible || shownRef.current) return;
    shownRef.current = true;
    analytics.capture("welcome_save_shown", { trial });
  }, [visible, trial]);

  const finish = (action: "explore" | "dismiss") => {
    welcomeSave.finish(userId);
    analytics.capture("welcome_save_action", { action, trial });
  };

  return (
    <PromptSheet
      testID="welcome-save-sheet"
      visible={visible}
      onClose={() => finish("dismiss")}
      title={t("welcomeLetter.title")}
      body={t("welcomeLetter.body")}
      actions={
        <PillButton
          label={t("welcomeLetter.cta")}
          onPress={() => finish("explore")}
        />
      }
    >
      <View style={styles.signature}>
        <Text style={styles.name}>{t("welcomeLetter.signature")}</Text>
        <Text style={styles.role}>{t("welcomeLetter.role")}</Text>
      </View>
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  signature: {
    gap: 2,
    paddingBottom: theme.gap(1),
  },
  name: {
    fontFamily: theme.fonts.display,
    fontSize: 26,
    color: theme.colors.primaryText,
  },
  role: {
    ...theme.type.caption,
    color: theme.colors.muted,
  },
}));
