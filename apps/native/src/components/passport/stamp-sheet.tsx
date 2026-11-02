import { AppSymbolIcon } from "@/components/symbol";
import { Button } from "@/components/ui/button";
import { PromptSheet } from "@/components/ui/prompt-sheet";
import { formatShortDate } from "@/lib/date";
import { t } from "@/lib/i18n";
import type { OpenStamp } from "@/lib/passport";
import { Image } from "expo-image";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function StampArt({
  cover,
  ink,
  size = 168,
}: {
  cover: string | null;
  ink: string;
  size?: number;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={[styles.stamp, { width: size, height: size }]}>
      {cover ? (
        <Image
          source={{ uri: cover }}
          style={styles.cover}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.cover, styles.blank]}>
          <AppSymbolIcon
            name="mappin"
            size={size / 3}
            tintColor={theme.colors.primaryText}
          />
        </View>
      )}
      <View style={styles.inkBand}>
        <Text style={styles.ink} numberOfLines={1} adjustsFontSizeToFit>
          {ink}
        </Text>
      </View>
    </View>
  );
}

export function StampSheet({
  stamp,
  count,
  busy,
  onClose,
  onRemove,
}: {
  stamp: OpenStamp | null;
  count: number;
  busy: boolean;
  onClose: () => void;
  onRemove: () => void;
}) {
  const ink =
    stamp === null
      ? ""
      : stamp.at === null
        ? stamp.city
        : t("passport.stampInk", {
            city: stamp.city,
            date: formatShortDate(stamp.at),
          });
  return (
    <PromptSheet
      visible={stamp !== null}
      onClose={onClose}
      testID="stamp-sheet"
      title={t("passport.stampedTitle")}
      body={stamp ? t("passport.stampedBody", { name: stamp.name, count }) : ""}
      actions={
        <>
          <Button title={t("common.done")} onPress={onClose} />
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={onRemove}
            style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
          >
            <Text style={styles.removeText}>
              {stamp?.fresh ? t("common.undo") : t("passport.removeStamp")}
            </Text>
          </Pressable>
        </>
      }
    >
      {stamp ? (
        <View style={styles.art}>
          <StampArt cover={stamp.cover} ink={ink} />
          {stamp.cover ? (
            <Text style={styles.credit}>{t("passport.coverCredit")}</Text>
          ) : null}
        </View>
      ) : null}
    </PromptSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  art: {
    alignItems: "center",
    gap: theme.gap(1),
    paddingVertical: theme.gap(1),
  },
  stamp: {
    padding: 6,
    borderRadius: theme.radius.md,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: theme.colors.primaryText,
    backgroundColor: theme.colors.surface,
    transform: [{ rotate: "-4deg" }],
  },
  cover: {
    flex: 1,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surfaceMuted,
  },
  blank: { alignItems: "center", justifyContent: "center" },
  inkBand: {
    position: "absolute",
    left: 6,
    right: 6,
    bottom: 14,
    paddingVertical: 4,
    paddingHorizontal: theme.gap(1),
    backgroundColor: theme.colors.primarySoft,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: theme.colors.primaryText,
  },
  ink: {
    ...theme.type.captionStrong,
    color: theme.colors.primaryText,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  credit: { ...theme.type.finePrint, color: theme.colors.muted },
  remove: {
    minHeight: theme.control.minHeight,
    alignItems: "center",
    justifyContent: "center",
  },
  removeText: { ...theme.type.bodyLabel, color: theme.colors.muted },
  pressed: { opacity: theme.opacity.pressed },
}));
