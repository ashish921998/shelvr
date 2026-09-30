import { SettingCard } from "@/components/ui/setting-card";
import { useAppUpdate, type UpdateState } from "@/lib/app-update";
import { formatItemDate } from "@/lib/date";
import { t, useAppLocale } from "@/lib/i18n";
import type { TextMessageKey } from "@/locales/message-types";
import { useUnistyles } from "react-native-unistyles";

/** Button label and status line for each state; one table, no precedence. */
function copyFor(state: UpdateState): {
  label: TextMessageKey;
  note: TextMessageKey | null;
} {
  switch (state.kind) {
    case "unsupported":
    case "idle":
      return { label: "updates.check", note: null };
    case "checking":
      return { label: "updates.checking", note: null };
    case "downloading":
      return { label: "updates.downloading", note: null };
    case "upToDate":
      return { label: "updates.check", note: "updates.latest" };
    case "ready":
    case "restarting":
      return { label: "updates.restart", note: "updates.ready" };
    case "failed":
      return state.at === "check"
        ? { label: "updates.check", note: "updates.checkFailed" }
        : { label: "updates.restart", note: "updates.restartFailed" };
  }
}

/**
 * Manual EAS Update check on Profile. The native side already checks on
 * launch; this pulls an update on the build's channel without a cold start.
 * A found update downloads straight away, then the action offers the restart.
 * Ported from Amber (#16).
 */
export function UpdateSetting() {
  useAppLocale();
  const { theme } = useUnistyles();
  const { state, act, runningSince } = useAppUpdate(
    theme.colors.background,
    theme.colors.primary,
  );
  // A release build with updates off has nothing to offer; hide the card
  // rather than call it a development build.
  if (state.kind === "unsupported" && state.reason === "disabled") return null;
  const { label, note } = copyFor(state);
  const busy =
    state.kind === "checking" ||
    state.kind === "downloading" ||
    state.kind === "restarting";

  const description =
    state.kind === "unsupported"
      ? t("updates.development")
      : runningSince === null
        ? t("updates.embedded")
        : t("updates.running", { date: formatItemDate(runningSince) });

  return (
    <SettingCard
      title={t("updates.title")}
      description={description}
      action={{
        label: t(label),
        onPress: () => void act(),
        disabled: state.kind === "unsupported",
        busy,
        testID: "update-setting",
      }}
      note={note ? t(note) : null}
    />
  );
}
