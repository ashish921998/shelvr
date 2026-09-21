import { t, useAppLocale } from "@/lib/i18n";
import { type FC } from "react";
import { Text } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import { fadeIn } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import type { TidyCounts } from "@/lib/tidy/use-tidy-actions";

type Props = {
  counts: TidyCounts;
  /** Deletes queued but not yet confirmed via the system dialog. */
  pendingDeleteCount: number;
  /** Name of the current source, for the empty-source message. */
  sourceTitle: string;
  /** True when the source had no unreviewed photos at all. */
  empty: boolean;
  loading: boolean;
  onContinue: () => void;
};

/** Batch checkpoint: summarizes the sweep and gates the next batch behind
 * one delete-confirmation dialog. Also covers a source with nothing left. */
export const TidyDone: FC<Props> = ({
  counts,
  pendingDeleteCount,
  sourceTitle,
  empty,
  loading,
  onContinue,
}) => {
  useAppLocale();
  const summary = [
    t("tidy.keptCount", { count: counts.kept }),
    t("tidy.savedCount", { count: counts.saved }),
    t("tidy.deletedCount", { count: pendingDeleteCount + counts.deleted }),
  ].join("  ·  ");

  return (
    <Animated.View entering={fadeIn} style={styles.container}>
      <Text style={styles.title}>
        {empty ? t("tidy.completeTitle") : t("tidy.batchTitle")}
      </Text>
      <Text style={styles.summary}>
        {empty
          ? t("tidy.emptyBody", {
              source: sourceTitle,
            })
          : summary}
      </Text>
      {pendingDeleteCount > 0 && (
        <Text style={styles.note}>
          {t("tidy.pendingDeleteCount", { count: pendingDeleteCount })}
        </Text>
      )}
      {!empty && (
        <Button
          title={t("tidy.continue")}
          loading={loading}
          onPress={onContinue}
          style={styles.button}
        />
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create((theme) => ({
  container: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: theme.gap(1.5),
    paddingHorizontal: theme.gap(4),
    backgroundColor: theme.colors.background,
  },
  title: {
    fontFamily: theme.fonts.display,
    fontSize: 26,
    color: theme.colors.foreground,
  },
  summary: {
    fontFamily: theme.fonts.regular,
    fontSize: 15,
    color: theme.colors.muted,
    textAlign: "center",
  },
  note: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    color: theme.colors.faint,
    textAlign: "center",
  },
  button: {
    marginTop: theme.gap(2),
    minWidth: 160,
  },
}));
