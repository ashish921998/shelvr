import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import type { DemoSample } from "@/lib/onboarding-demo";
import { useOAuthSignIn } from "@/lib/oauth-sign-in";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { GhostButton } from "@/components/onboarding/parts";
import { SampleCard } from "@/components/onboarding/sample-card";
import { SignInButtons } from "@/components/onboarding/sign-in-buttons";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** A previewed sample, signed out: the sample as it would be filed, then
 * "Save your shelf". Signing in lets the demo step save it for real. */
export function SampleSignIn({
  sample,
  space,
  saving,
  onNotNow,
}: {
  sample: DemoSample;
  space: string | null;
  /** Signed in and the save is landing: nothing here takes a tap. */
  saving: boolean;
  onNotNow: () => void;
}) {
  useAppLocale();
  const oauth = useOAuthSignIn("sample_preview");
  const busy = saving || oauth.pendingProvider !== null;

  useEffect(() => {
    analytics.capture("onboarding_signin_prompt", {
      surface: "sample_preview",
      action: "shown",
    });
  }, []);

  const notNow = () => {
    analytics.capture("onboarding_signin_prompt", {
      surface: "sample_preview",
      action: "dismissed",
    });
    onNotNow();
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.verdict} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {t("reveal.previewTitle")}{" "}
        <Text style={styles.verdictMuted}>{t("reveal.previewSubtitle")}</Text>
      </Text>

      <View pointerEvents="none">
        <SampleCard sample={sample} action="preview" disabled={false} />
      </View>

      {space ? (
        <View style={styles.dest}>
          <Text style={styles.destText}>{t("reveal.filedIn", { space })}</Text>
        </View>
      ) : null}

      <View style={styles.foot}>
        <Text
          style={styles.saveShelf}
          maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
        >
          {t("reveal.saveShelf")}
        </Text>
        <Text style={styles.support}>{t("demo.signInHelp")}</Text>
        <View pointerEvents={saving ? "none" : "auto"}>
          <SignInButtons oauth={oauth} />
        </View>
        <GhostButton
          label={t("common.notNow")}
          onPress={notNow}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  wrap: {
    flex: 1,
    gap: theme.gap(2),
  },
  verdict: {
    fontFamily: theme.fonts.display,
    fontSize: 28,
    lineHeight: 34,
    color: theme.colors.foreground,
  },
  verdictMuted: {
    color: theme.colors.muted,
  },
  dest: {
    alignSelf: "flex-start",
    paddingVertical: theme.gap(0.75),
    paddingHorizontal: theme.gap(1.5),
    borderRadius: 50,
    backgroundColor: theme.colors.primarySoft,
  },
  destText: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.primaryText,
  },
  support: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 21,
    color: theme.colors.muted,
  },
  foot: {
    marginTop: "auto",
    gap: theme.gap(1),
  },
  saveShelf: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.foreground,
  },
}));
