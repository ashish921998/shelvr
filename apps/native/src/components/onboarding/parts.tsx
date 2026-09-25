import { PrimaryButton, TertiaryAction } from "@/components/shelf/ink-button";

// Onboarding's footer controls. They defer to the shelf button kit so the CTA
// is the same ink pill the rest of the app uses — amber is an accent here, not
// a hero surface, and a button that is working says so with stitches rather
// than a spinner.

/** The primary CTA used by every step's footer. */
export function CtaButton({
  label,
  onPress,
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <PrimaryButton
      label={label}
      pendingLabel={label}
      state={busy ? "pending" : disabled ? "disabled" : "idle"}
      onPress={onPress}
      style={styles.cta}
    />
  );
}

/** The quiet secondary action under a CTA. */
export function GhostButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TertiaryAction label={label} onPress={disabled ? undefined : onPress} />
  );
}

const styles = { cta: { alignSelf: "stretch" } } as const;
