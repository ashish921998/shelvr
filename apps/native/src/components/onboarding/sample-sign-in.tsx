import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import type { DemoSample } from "@/lib/onboarding-demo";
import { useOAuthSignIn } from "@/lib/oauth-sign-in";
import { HEADLINE_MAX_SCALE } from "@/lib/use-large-text";
import { sampleImage } from "@/components/onboarding/sample-card";
import { SaveSummary } from "@/components/onboarding/save-summary";
import { SignInButtons } from "@/components/onboarding/sign-in-buttons";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

/** A previewed sample, signed out: the sample as a filed save, then "Save your
 * shelf". Signing in lets the demo step save it for real; the screen's back
 * button is the way out.
 *
 * Nothing has read the page yet, so the save shows only what is already
 * known: the page's own heading, its site, and the space it goes to. Tags come
 * from the classifier and appear on the step after sign-in. */
export function SampleSignIn({
  sample,
  space,
  saving,
}: {
  sample: DemoSample;
  space: string | null;
  /** Signed in and the save is landing: nothing here takes a tap. */
  saving: boolean;
}) {
  useAppLocale();
  const oauth = useOAuthSignIn("sample_preview");

  useEffect(() => {
    analytics.capture("onboarding_signin_prompt", {
      surface: "sample_preview",
      action: "shown",
    });
  }, []);

  return (
    <View style={styles.wrap}>
      <Text style={styles.verdict} maxFontSizeMultiplier={HEADLINE_MAX_SCALE}>
        {t("reveal.previewTitle")}{" "}
        <Text style={styles.verdictMuted}>{t("reveal.previewSubtitle")}</Text>
      </Text>

      <SaveSummary
        image={sampleImage(sample)}
        title={sample.pageHeading}
        meta={sample.domain}
      />

      {space ? (
        <View style={styles.dest}>
          <Text style={styles.destText}>{t("reveal.filedIn", { space })}</Text>
        </View>
      ) : null}

      <View style={styles.foot}>
        <View style={styles.pitch}>
          <Text
            style={styles.saveShelf}
            maxFontSizeMultiplier={HEADLINE_MAX_SCALE}
          >
            {t("reveal.saveShelf")}
          </Text>
          <Text style={styles.reason}>{t("reveal.saveShelfReason")}</Text>
        </View>
        <View style={styles.buttons} pointerEvents={saving ? "none" : "auto"}>
          <SignInButtons oauth={oauth} privacyNote={false} />
        </View>
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
  foot: {
    marginTop: "auto",
    gap: theme.gap(2),
  },
  buttons: {
    gap: theme.gap(1.5),
  },
  saveShelf: {
    fontFamily: theme.fonts.display,
    fontSize: 22,
    lineHeight: 28,
    color: theme.colors.foreground,
  },
  pitch: {
    gap: theme.gap(0.5),
  },
  reason: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    lineHeight: 20,
    color: theme.colors.muted,
  },
}));
