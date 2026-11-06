import { SettingCard } from "@/components/ui/setting-card";
import { useSaveAllSwitch } from "@/lib/creator-map";
import { t, useAppLocale } from "@/lib/i18n";
import { Switch } from "react-native";
import { useUnistyles } from "react-native-unistyles";

export function MapPageSaveAll() {
  useAppLocale();
  const { theme } = useUnistyles();
  const saveAll = useSaveAllSwitch();
  if (!saveAll.ready) return null;
  return (
    <SettingCard
      title={t("creatorMaps.switchTitle")}
      description={t("creatorMaps.switchBody")}
      accessory={
        <Switch
          testID="map-page-save-all"
          accessibilityLabel={t("creatorMaps.switchTitle")}
          value={saveAll.on}
          disabled={saveAll.busy}
          onValueChange={saveAll.toggle}
          trackColor={{
            false: theme.colors.border,
            true: theme.colors.primary,
          }}
          thumbColor="#fff"
        />
      }
    />
  );
}
