import { SettingCard } from "@/components/ui/setting-card";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";

export function MapPageSetting() {
  const router = useRouter();
  const page = useQuery(convexQuery(api.publicMaps.getMyPublicMap, {}));
  const on = !!page.data && !page.data.blocked;
  return (
    <SettingCard
      title={t("publicMap.settingTitle")}
      description={
        on && page.data
          ? t("publicMap.settingOn", { count: page.data.cities.length })
          : t("publicMap.settingOff")
      }
      action={{
        label: on ? t("publicMap.manage") : t("publicMap.setUp"),
        busy: page.isPending,
        testID: "map-page-setting",
        onPress: () =>
          router.push({ pathname: "/map-page", params: { from: "settings" } }),
      }}
    />
  );
}
