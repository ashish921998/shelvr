import { AppSymbolIcon } from "@/components/symbol";
import { ActionMenu } from "@/components/ui/action-menu";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { savedByLine, type SharedListPlace } from "@/lib/shared-lists";
import { Pressable, View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

type Props = {
  place: SharedListPlace;
  number: number;
  selected: boolean;
  onPress: () => void;
  onPlaceDetails?: () => void;
  onVisited: (visited: boolean) => void;
  onRemove: () => void;
};

export function ListPlaceRow({
  place,
  number,
  selected,
  onPress,
  onPlaceDetails,
  onVisited,
  onRemove,
}: Props) {
  const { theme } = useUnistyles();
  const by = savedByLine(place);
  const went = place.visitedAt !== undefined;
  return (
    <View
      style={[
        styles.row,
        place.isNew && styles.fresh,
        selected && styles.selected,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[place.name, by, went ? t("plan.weWent") : null]
          .filter(Boolean)
          .join(", ")}
        accessibilityState={{ selected }}
        onPress={onPress}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <View style={styles.badge}>
          <ThemedText variant="badge" style={styles.badgeText}>
            {number}
          </ThemedText>
        </View>
        <View style={styles.text}>
          <ThemedText variant="subheadStrong" numberOfLines={2}>
            {place.name}
          </ThemedText>
          <ThemedText variant="footnote" style={styles.muted} numberOfLines={1}>
            {by}
          </ThemedText>
        </View>
        {went ? (
          <View style={styles.went}>
            <ThemedText variant="captionStrong" style={styles.muted}>
              {t("plan.weWent")}
            </ThemedText>
          </View>
        ) : null}
      </Pressable>
      {selected && onPlaceDetails ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("cityMap.placeDetails", { name: place.name })}
          onPress={onPlaceDetails}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <AppSymbolIcon
            name="info.circle"
            size={22}
            tintColor={theme.colors.foreground}
          />
        </Pressable>
      ) : null}
      <ActionMenu
        label={t("sharedLists.placeActions")}
        title={place.name}
        actions={[
          {
            id: "visited",
            label: went ? t("sharedLists.notYet") : t("plan.weWent"),
            onPress: () => onVisited(!went),
          },
          {
            id: "remove",
            label: t("sharedLists.removeFromList"),
            destructive: true,
            onPress: onRemove,
          },
        ]}
        style={styles.action}
      >
        <AppSymbolIcon
          name="ellipsis"
          size={18}
          weight="semibold"
          tintColor={theme.colors.muted}
        />
      </ActionMenu>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    minHeight: theme.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: -theme.gap(0.75),
    borderRadius: theme.radius.md,
    borderCurve: "continuous",
  },
  fresh: { backgroundColor: theme.colors.primarySoft },
  selected: { backgroundColor: theme.colors.surfaceMuted },
  body: {
    flex: 1,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(0.75),
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primary,
  },
  badgeText: { color: theme.colors.onTint },
  text: { flex: 1, gap: theme.gap(0.25) },
  muted: { color: theme.colors.muted },
  went: {
    paddingVertical: theme.gap(0.5),
    paddingHorizontal: theme.gap(1.25),
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceMuted,
  },
  action: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  pressed: { opacity: theme.opacity.pressed },
}));
