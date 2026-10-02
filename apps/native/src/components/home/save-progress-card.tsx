import { t, useAppLocale } from "@/lib/i18n";
import { analytics } from "@/lib/analytics";
import { pickAndSaveImages } from "@/lib/pick-and-save-images";
import { progressTitleKey } from "@/lib/save-goal";
import { useSaveImageBatch } from "@/lib/use-save-image-batch";
import { InlineCard } from "@/components/ui/inline-card";
import { AppSymbolIcon, type AppSymbolName } from "@/components/symbol";
import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, Platform, Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

/** Funnel placement for a save the server refuses for Pro. */
const PAYWALL_PLACEMENT = "home_progress";

function Way({
  icon,
  title,
  help,
  onPress,
  disabled,
  testID,
}: {
  icon: AppSymbolName;
  title: string;
  help?: string;
  onPress?: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  const { theme } = useUnistyles();
  const body = (
    <>
      <View style={styles.wayIcon}>
        <AppSymbolIcon
          name={icon}
          size={17}
          weight="semibold"
          tintColor={theme.colors.primaryText}
        />
      </View>
      <View style={styles.wayText}>
        <Text style={styles.wayTitle}>{title}</Text>
        {help ? <Text style={styles.wayHelp}>{help}</Text> : null}
      </View>
      {onPress ? (
        <AppSymbolIcon
          name="chevron.right"
          size={13}
          tintColor={theme.colors.faint}
        />
      ) : null}
    </>
  );
  if (!onPress) {
    return (
      <View style={styles.way} testID={testID}>
        {body}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.way,
        (pressed || disabled) && { opacity: 0.6 },
      ]}
    >
      {body}
    </Pressable>
  );
}

/**
 * The "save your next two" card on Home: how far a new shelf is from its
 * first three real saves, and the real ways to get there. Sharing is shown
 * as a how-to (it starts in another app); Photos and a note start right here.
 * Home decides when it shows.
 */
export function SaveProgressCard({
  saved,
  goal,
  onDismiss,
}: {
  saved: number;
  goal: number;
  onDismiss: () => void;
}) {
  useAppLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const count = t("home.progressCount", { saved, total: goal });

  const runImageRequests = useSaveImageBatch({
    saveSource: "photo_import",
    paywallPlacement: PAYWALL_PLACEMENT,
    setBusy,
    onAllSaved: (results) => {
      if (results.length > 0) {
        analytics.capture("images_saved", { image_count: results.length });
      }
    },
    onDismiss: () => {},
    onUnexpectedError: (error) => {
      analytics.captureError("image_upload_failed", error);
      Alert.alert(t("errors.saveTitle"), t("errors.batchUpload"));
    },
  });

  const pickPhotos = () => {
    analytics.capture("save_progress_card_action", { action: "photos", saved });
    void pickAndSaveImages(runImageRequests).catch((error: unknown) => {
      analytics.captureError("image_pick_failed", error);
    });
  };

  const writeNote = () => {
    analytics.capture("save_progress_card_action", { action: "note", saved });
    router.push({ pathname: "/add", params: { mode: "note" } });
  };

  return (
    <InlineCard
      testID="save-progress-card"
      title={t(progressTitleKey(saved, goal))}
      body={t("home.progressBody")}
    >
      <View style={styles.progress} accessible accessibilityLabel={count}>
        <View style={styles.dots}>
          {Array.from({ length: goal }, (_, index) => (
            <View
              key={index}
              style={[styles.dot, index < saved && styles.dotFilled]}
            />
          ))}
        </View>
        <Text style={styles.count}>{count}</Text>
      </View>
      <View style={styles.ways}>
        <Way
          testID="save-progress-share"
          icon="square.and.arrow.up"
          title={
            Platform.OS === "android"
              ? t("home.progressShareAndroid")
              : t("home.progressShare")
          }
          help={t("home.progressShareHelp")}
        />
        <Way
          testID="save-progress-photos"
          icon="photo.on.rectangle"
          title={t("home.progressPhotos")}
          onPress={pickPhotos}
          disabled={busy}
        />
        <Way
          testID="save-progress-note"
          icon="square.and.pencil"
          title={t("home.progressNote")}
          onPress={writeNote}
          disabled={busy}
        />
      </View>
      <View style={styles.buttonRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("common.notNow")}
          style={({ pressed }) => [
            styles.secondaryButton,
            pressed && { opacity: 0.7 },
          ]}
          onPress={onDismiss}
        >
          <Text style={styles.secondaryButtonText}>{t("common.notNow")}</Text>
        </Pressable>
      </View>
    </InlineCard>
  );
}

const styles = StyleSheet.create((theme) => ({
  progress: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1),
    marginVertical: theme.gap(0.5),
  },
  dots: {
    flexDirection: "row",
    gap: theme.gap(0.5),
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  dotFilled: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
  },
  count: {
    fontFamily: theme.fonts.medium,
    fontSize: 13,
    color: theme.colors.muted,
  },
  ways: {
    gap: theme.gap(0.5),
  },
  way: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    paddingVertical: theme.gap(0.75),
  },
  wayIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  wayText: {
    flex: 1,
    gap: 2,
  },
  wayTitle: {
    fontFamily: theme.fonts.medium,
    fontSize: 15,
    color: theme.colors.foreground,
  },
  wayHelp: {
    fontFamily: theme.fonts.regular,
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.muted,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "center",
  },
  secondaryButton: {
    minHeight: 44,
    paddingHorizontal: theme.gap(2),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    fontFamily: theme.fonts.medium,
    fontSize: 14,
    color: theme.colors.muted,
  },
}));
