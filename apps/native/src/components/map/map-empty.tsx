import { MapRoundButton } from "@/components/map/map-round-button";
import { AppSymbolIcon } from "@/components/symbol";
import { ThemedText } from "@/components/ui/themed-text";
import { t } from "@/lib/i18n";
import { View } from "react-native";
import { StyleSheet, useUnistyles } from "react-native-unistyles";

export function MapEmpty({
  located,
  onLocate,
}: {
  located: boolean;
  onLocate: () => void;
}) {
  const { theme } = useUnistyles();
  return (
    <View style={styles.column} pointerEvents="box-none">
      {located ? (
        <View style={styles.locate}>
          <MapRoundButton
            icon="location"
            label={t("map.showMyLocation")}
            onPress={onLocate}
          />
        </View>
      ) : null}
      <View style={styles.card}>
        <View style={styles.badge}>
          <AppSymbolIcon
            name="mappin"
            size={20}
            tintColor={theme.colors.primaryText}
          />
        </View>
        <View style={styles.copy}>
          <ThemedText variant="title">{t("map.emptyTitle")}</ThemedText>
          <ThemedText variant="subhead" style={styles.body}>
            {t("map.emptyBody")}
          </ThemedText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  column: {
    position: "absolute",
    left: theme.gap(2),
    right: theme.gap(2),
    bottom: theme.gap(5),
    gap: theme.gap(1),
  },
  locate: { alignSelf: "flex-end" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.gap(1.5),
    padding: theme.gap(2),
    borderRadius: theme.radius.lg,
    borderCurve: "continuous",
    backgroundColor: theme.colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    boxShadow: "0 4px 14px rgba(0, 0, 0, 0.12)",
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.primarySoft,
  },
  copy: { flex: 1, gap: theme.gap(0.5) },
  body: { color: theme.colors.muted },
}));
