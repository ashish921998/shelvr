import { analytics } from "@/lib/analytics";
import { usePaywallGuard } from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { api } from "@convex/_generated/api";
import { MAX_LIST_NAME_CHARS } from "@convex/model/sharedListLimits";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useCallback, useState } from "react";
import { Alert } from "react-native";

export function creatorMapListName(
  ownerName: string | undefined,
  city: string,
): string {
  const named = ownerName
    ? t("creatorMaps.listName", { name: ownerName, city })
    : null;
  if (named !== null && named.length <= MAX_LIST_NAME_CHARS) return named;
  const plain = t("creatorMaps.listNameNoName", { city });
  if (plain.length <= MAX_LIST_NAME_CHARS) return plain;
  return city.slice(0, MAX_LIST_NAME_CHARS);
}

type SaveAllSwitch = {
  ready: boolean;
  on: boolean;
  busy: boolean;
  toggle(next: boolean): void;
};

export function useSaveAllSwitch(): SaveAllSwitch {
  const page = useQuery(convexQuery(api.publicMaps.getMyPublicMap, {})).data;
  const setSaveAll = useMutation(api.publicMaps.setPublicMapSaveAll);
  const { guard, loading: guardLoading } = usePaywallGuard("creator_map");
  const [moving, setMoving] = useState<boolean | null>(null);
  const saved = page?.saveAll === true;

  const toggle = useCallback(
    (next: boolean) => {
      void (async () => {
        if (next && !(await guard())) return;
        setMoving(next);
        try {
          await setSaveAll({ on: next });
          analytics.capture("creator_map_save_all_switched", { on: next });
        } catch (error) {
          analytics.captureError("creator_map_switch_failed", error);
          Alert.alert(t("creatorMaps.switchFailed"));
        } finally {
          setMoving(null);
        }
      })();
    },
    [guard, setSaveAll],
  );

  return {
    ready: !!page && !page.blocked,
    on: moving ?? saved,
    busy: moving !== null || (!saved && guardLoading),
    toggle,
  };
}
