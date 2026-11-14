import { analytics } from "@/lib/analytics";
import {
  openPaywall,
  useEntitlement,
  usePaywallGuard,
} from "@/lib/entitlement";
import { t } from "@/lib/i18n";
import { type CityStamp, cityStampLabel } from "@/lib/city-stamp-data";
import type { SampleCityId } from "@/lib/sample-cities";
import { cityStampMoment, useStampMoment } from "@/lib/stamp-moment";
import { api } from "@convex/_generated/api";
import { CITY_STAMP_CITIES, isCityStampId } from "@convex/model/cityStamps";
import { isRateLimitedError } from "@convex/model/demoErrors";
import { saveErrorCode } from "@convex/model/saveErrors";
import type { OptimisticLocalStore } from "convex/browser";
import { useMutation } from "convex/react";
import { useNavigation, useRouter } from "expo-router";
import { useCallback, useMemo, useRef } from "react";
import { Alert } from "react-native";

export function applyCityStampChange(
  current: readonly CityStamp[],
  city: string,
  stamped: boolean,
  now: number,
): CityStamp[] {
  const rest = current.filter((stamp) => stamp.city !== city);
  if (!stamped || !isCityStampId(city)) return rest;
  return [
    ...rest,
    { city, country: CITY_STAMP_CITIES[city].country, stampedAt: now },
  ].sort((a, b) => a.city.localeCompare(b.city));
}

function reportFailure(error: unknown): void {
  if (isRateLimitedError(error)) {
    Alert.alert(t("cityStamps.rateLimited"));
    return;
  }
  analytics.captureError("city_stamp_update_failed", error);
  Alert.alert(t("cityStamps.saveFailed"), t("errors.connection"));
}

function useCityStampMutations() {
  const add = useMutation(api.cityStamps.addCityStamp);
  const remove = useMutation(api.cityStamps.removeCityStamp);
  return useMemo(() => {
    const optimistic =
      (city: string, stamped: boolean) => (store: OptimisticLocalStore) => {
        const current = store.getQuery(api.cityStamps.listCityStamps, {});
        if (current === undefined) return;
        store.setQuery(
          api.cityStamps.listCityStamps,
          {},
          applyCityStampChange(current, city, stamped, Date.now()),
        );
      };
    return {
      add: (city: string) => add({ city }),
      remove: (city: string) =>
        remove.withOptimisticUpdate(optimistic(city, false))({ city }),
    };
  }, [add, remove]);
}

export function useCityStampToggle(): (
  city: SampleCityId,
  stamped: boolean,
  count: number,
) => Promise<boolean> {
  const router = useRouter();
  const navigation = useNavigation();
  const mutations = useCityStampMutations();
  const { play } = useStampMoment();
  const working = useRef(new Set<string>());
  return useCallback(
    async (city: SampleCityId, stamped: boolean, count: number) => {
      if (working.current.has(city)) return false;
      working.current.add(city);
      try {
        if (!stamped) {
          await mutations.remove(city);
        } else if ((await mutations.add(city)) && navigation.isFocused()) {
          play(cityStampMoment(cityStampLabel(city)), "city_stamps");
        }
        analytics.capture("passport_city_stamp_changed", { stamped, count });
        return true;
      } catch (error) {
        if (saveErrorCode(error) === "pro_required") {
          await openPaywall(router, "passport");
          return false;
        }
        reportFailure(error);
        return false;
      } finally {
        working.current.delete(city);
      }
    },
    [mutations, navigation, play, router],
  );
}

export function useRemoveCityStamp(): (city: string, left: number) => void {
  const mutations = useCityStampMutations();
  return useCallback(
    (city: string, left: number) => {
      Alert.alert(
        t("cityStamps.removeTitle", { city: cityStampLabel(city) }),
        undefined,
        [
          { text: t("common.cancel"), style: "cancel" },
          {
            text: t("cityStamps.remove"),
            style: "destructive",
            onPress: () => {
              void mutations.remove(city).then(
                () =>
                  analytics.capture("passport_city_stamp_changed", {
                    stamped: false,
                    count: left,
                  }),
                reportFailure,
              );
            },
          },
        ],
      );
    },
    [mutations],
  );
}

export function useCityStampAccess(count: number): {
  locked: boolean;
  open: () => void;
} {
  const router = useRouter();
  const { entitled, loading } = useEntitlement();
  const { guard } = usePaywallGuard("passport");
  const locked = !loading && !entitled;
  const open = useCallback(() => {
    if (locked) {
      analytics.capture("passport_paywall_opened", { surface: "city_stamp" });
      void guard();
      return;
    }
    analytics.capture("passport_city_stamps_opened", { count });
    router.push("/city-stamps");
  }, [count, guard, locked, router]);
  return { locked, open };
}
