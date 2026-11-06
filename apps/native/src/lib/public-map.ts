import { analytics } from "@/lib/analytics";
import { useEntitlement, usePaywallGuard } from "@/lib/entitlement";
import { haptics } from "@/lib/haptics";
import { t } from "@/lib/i18n";
import { shareRefOf, shareUrl } from "@/lib/share-link";
import { webUrl } from "@/lib/web-url";
import { api } from "@convex/_generated/api";
import { MAX_PUBLIC_MAP_CITIES } from "@convex/model/publicMapLimits";
import { cityKey } from "@convex/model/trip";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useMutation } from "convex/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Share } from "react-native";

type PreviewPlace = { name: string; went: boolean };
type CityPreview = { city: string; places: PreviewPlace[] };
type OwnPage = { token: string; cities: string[]; blocked: boolean };
type Surface = "map" | "settings";
type FailureEvent =
  | "public_map_save_failed"
  | "public_map_rotate_failed"
  | "public_map_turn_off_failed";

export type MapPageCity = {
  city: string;
  places: PreviewPlace[];
  picked: boolean;
  disabled: boolean;
};

export type MapPageStatus =
  | "error"
  | "loading"
  | "blocked"
  | "empty"
  | "off"
  | "on";

export type MapPage = {
  status: MapPageStatus;
  url: string | null;
  cities: MapPageCity[];
  pickedCount: number;
  edited: boolean;
  canSubmit: boolean;
  showsBeen: boolean;
  busy: boolean;
  toggle(city: string): void;
  submit(): Promise<void>;
  share(): Promise<void>;
  rotate(): void;
  turnOff(): void;
};

export function publicMapUrl(token: string): string {
  return webUrl(`/m/${encodeURIComponent(token)}`);
}

export function sameCities(
  a: readonly string[],
  b: readonly string[],
): boolean {
  const left = new Set(a.map(cityKey));
  const right = new Set(b.map(cityKey));
  return left.size === right.size && [...left].every((key) => right.has(key));
}

export async function sharePublicMap(token: string): Promise<boolean> {
  const url = publicMapUrl(token);
  try {
    const result = await shareUrl(url);
    const shared = result.action === Share.sharedAction;
    const ref = await shareRefOf(url);
    analytics.capture("public_map_shared", {
      shared,
      ...(ref ? { share_ref: ref } : {}),
    });
    return shared;
  } catch (error) {
    analytics.captureError("public_map_share_failed", error);
    return false;
  }
}

export function mapPageCities(
  previews: readonly CityPreview[],
  pageCities: readonly string[] | null,
  picked: readonly string[],
): MapPageCity[] {
  const listed = new Set(previews.map((preview) => cityKey(preview.city)));
  const missing = (pageCities ?? []).filter((city) => {
    const key = cityKey(city);
    if (listed.has(key)) return false;
    listed.add(key);
    return true;
  });
  const pickedKeys = new Set(picked.map(cityKey));
  const full = picked.length >= MAX_PUBLIC_MAP_CITIES;
  return [
    ...previews.map(({ city, places }) => ({ city, places })),
    ...missing.map((city) => ({ city, places: [] })),
  ].map((row) => {
    const isPicked = pickedKeys.has(cityKey(row.city));
    return { ...row, picked: isPicked, disabled: !isPicked && full };
  });
}

export function mapPageStatus(input: {
  isError: boolean;
  page: { blocked: boolean } | null | undefined;
  previews: readonly unknown[] | undefined;
}): MapPageStatus {
  const { isError, page, previews } = input;
  if (isError) return "error";
  if (page === undefined || previews === undefined) return "loading";
  if (page?.blocked) return "blocked";
  if (page === null) return previews.length === 0 ? "empty" : "off";
  return "on";
}

function toggled(current: readonly string[], city: string): string[] {
  const key = cityKey(city);
  if (current.some((entry) => cityKey(entry) === key)) {
    return current.filter((entry) => cityKey(entry) !== key);
  }
  return current.length >= MAX_PUBLIC_MAP_CITIES
    ? [...current]
    : [...current, city];
}

function useOpenedOnce(
  status: MapPageStatus,
  cities: number,
  surface: Surface,
): void {
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current || status === "error" || status === "loading") {
      return;
    }
    reported.current = true;
    analytics.capture("public_map_opened", {
      on: status === "on",
      cities,
      surface,
    });
  }, [status, cities, surface]);
}

function useRunner(setBusy: (busy: boolean) => void) {
  return useCallback(
    async (event: FailureEvent, work: () => Promise<void>) => {
      setBusy(true);
      try {
        await work();
      } catch (error) {
        analytics.captureError(event, error);
        Alert.alert(t("publicMap.failed"));
      } finally {
        setBusy(false);
      }
    },
    [setBusy],
  );
}

function useSubmit(input: {
  page: OwnPage | null | undefined;
  current: string[];
  edited: boolean;
  busy: boolean;
  guard: () => Promise<boolean>;
  setBusy: (busy: boolean) => void;
  setPicked: (picked: string[] | null) => void;
}) {
  const { page, current, edited, busy, guard, setBusy, setPicked } = input;
  const save = useMutation(api.publicMaps.setPublicMapCities);
  const run = useRunner(setBusy);
  return useCallback(async () => {
    if (busy || current.length === 0 || page === undefined) return;
    if (page !== null && (page.blocked || !edited)) return;
    const creating = page === null;
    await run("public_map_save_failed", async () => {
      if (creating && !(await guard())) return;
      const saved = await save({ cities: current });
      setPicked(null);
      void haptics.success();
      analytics.capture(
        creating ? "public_map_created" : "public_map_cities_saved",
        { cities: saved.cities.length },
      );
    });
  }, [busy, current, edited, guard, page, run, save, setPicked]);
}

function useRotate(setBusy: (busy: boolean) => void) {
  const rotateLink = useMutation(api.publicMaps.rotatePublicMapLink);
  const run = useRunner(setBusy);
  return useCallback(() => {
    Alert.alert(t("publicMap.newLinkTitle"), t("publicMap.newLinkBody"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("publicMap.newLink"),
        onPress: () =>
          void run("public_map_rotate_failed", async () => {
            if ((await rotateLink({})) === null) return;
            void haptics.success();
            analytics.capture("public_map_link_rotated", {});
          }),
      },
    ]);
  }, [rotateLink, run]);
}

function useTurnOff(
  needsPro: boolean,
  setBusy: (busy: boolean) => void,
  setPicked: (picked: string[] | null) => void,
) {
  const turnOffPage = useMutation(api.publicMaps.turnOffPublicMap);
  const run = useRunner(setBusy);
  return useCallback(() => {
    Alert.alert(
      t("publicMap.turnOffTitle"),
      needsPro ? t("publicMap.turnOffBodyNoPro") : t("publicMap.turnOffBody"),
      [
        { text: t("common.cancel"), style: "cancel" },
        {
          text: t("publicMap.turnOff"),
          style: "destructive",
          onPress: () =>
            void run("public_map_turn_off_failed", async () => {
              await turnOffPage({});
              setPicked([]);
              void haptics.success();
              analytics.capture("public_map_turned_off", {});
            }),
        },
      ],
    );
  }, [needsPro, run, setPicked, turnOffPage]);
}

export function useMapPage(surface: Surface): MapPage {
  const pageQuery = useQuery(convexQuery(api.publicMaps.getMyPublicMap, {}));
  const previewQuery = useQuery(
    convexQuery(api.publicMaps.listPublicMapCities, {}),
  );
  const { guard, loading: guardLoading } = usePaywallGuard("public_map");
  const { entitled, loading: entitlementLoading } = useEntitlement();
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const page = pageQuery.data;
  const status = mapPageStatus({
    isError: pageQuery.isError || previewQuery.isError,
    page,
    previews: previewQuery.data,
  });
  const current = picked ?? page?.cities ?? [];
  const edited = !!page && !page.blocked && !sameCities(current, page.cities);
  const cities = mapPageCities(
    previewQuery.data ?? [],
    page?.cities ?? null,
    current,
  );
  const toggle = useCallback(
    (city: string) =>
      setPicked((previous) => toggled(previous ?? page?.cities ?? [], city)),
    [page],
  );
  const submit = useSubmit({
    page,
    current,
    edited,
    busy,
    guard,
    setBusy,
    setPicked,
  });
  const token = status === "on" ? page?.token : undefined;
  const share = useCallback(async () => {
    if (token !== undefined) await sharePublicMap(token);
  }, [token]);
  const rotate = useRotate(setBusy);
  const turnOff = useTurnOff(
    !entitlementLoading && !entitled,
    setBusy,
    setPicked,
  );
  useOpenedOnce(status, page?.cities.length ?? 0, surface);
  return {
    status,
    url: token !== undefined ? publicMapUrl(token) : null,
    cities,
    pickedCount: current.length,
    edited,
    canSubmit:
      status === "off"
        ? current.length > 0 && !guardLoading
        : !edited || current.length > 0,
    showsBeen: cities.some(
      (row) => row.picked && row.places.some((place) => place.went),
    ),
    busy,
    toggle,
    submit,
    share,
    rotate,
    turnOff,
  };
}
