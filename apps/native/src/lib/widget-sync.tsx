import Constants from "expo-constants";
import { t, useAppLocale } from "./i18n";
import type { FeedItem } from "@/components/item-card";
import { analytics } from "@/lib/analytics";
import { useEntitlement } from "@/lib/entitlement";
import { displayHost } from "@/lib/url";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { Images } from "react-native-nitro-image";
import { recentSavesWidget } from "recent-saves-widget";
import type {
  RecentSavesWidgetProps,
  WidgetSaveItem,
} from "@/widgets/recent-saves-widget";

const WIDGET_ITEM_COUNT = 5;
const THUMB_PREFIX = "recent-saves-";
const DOWNLOAD_PREFIX = "widget-download-";
const THUMB_MAX_DIM = 512;
const THUMBNAIL_TIMEOUT_MS = 30_000;
const THUMBNAIL_TIMEOUT = "widget_thumbnail_timeout";
const WIDGET_LOCK_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

let thumbnailAttempt = 0;

async function ensureThumbnail(
  dir: Directory,
  item: FeedItem,
): Promise<string | undefined> {
  const url = item.imageUrl ?? item.heroImageUrl;
  if (!url) return undefined;
  const thumb = new File(dir, `${THUMB_PREFIX}${item._id}.jpg`);
  if (thumb.exists) return thumb.uri;

  const tag = `${item._id}-${++thumbnailAttempt}`;
  const download = new File(Paths.cache, `${DOWNLOAD_PREFIX}${tag}`);
  const staged = new File(Paths.cache, `${DOWNLOAD_PREFIX}${tag}.jpg`);
  deleteQuietly(download);
  deleteQuietly(staged);
  const build = buildThumbnail(url, download, staged).finally(() =>
    deleteQuietly(download),
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      build,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(THUMBNAIL_TIMEOUT)),
          THUMBNAIL_TIMEOUT_MS,
        );
      }),
    ]).finally(() => clearTimeout(timer));
  } catch (error) {
    const discard = () => deleteQuietly(staged);
    build.then(discard, discard);
    throw error;
  }
  try {
    staged.moveSync(thumb, { overwrite: true });
  } catch (error) {
    deleteQuietly(staged);
    throw error;
  }
  return thumb.uri;
}

async function buildThumbnail(
  url: string,
  download: File,
  staged: File,
): Promise<void> {
  await File.downloadFileAsync(url, download);
  const image = await Images.loadFromFileAsync(toPlainPath(download.uri));
  const scale = Math.min(
    1,
    THUMB_MAX_DIM / Math.max(image.width, image.height),
  );
  const resized =
    scale < 1
      ? await image.resizeAsync(
          Math.round(image.width * scale),
          Math.round(image.height * scale),
        )
      : image;
  await resized.saveToFileAsync(toPlainPath(staged.uri), "jpg", 80);
}

function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {}
}

function toPlainPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

function widgetTitle(item: FeedItem): string {
  if (item.title) return item.title;
  if (item.type === "note" && item.note)
    return (item.note.split("\n", 1)[0] ?? "").slice(0, 80);
  if (item.type === "link") return displayHost(item.url) || t("item.link");
  return t("item.savedItem");
}

function widgetSubtitle(item: FeedItem): string {
  if (item.type === "link")
    return item.siteName || displayHost(item.url) || t("item.link");
  if (item.type === "note") return t("item.note");
  return t("item.photo");
}

function deleteWidgetFiles(
  dir: Directory,
  keep?: Set<string>,
  prefix = THUMB_PREFIX,
) {
  let failed = false;
  for (const entry of dir.list()) {
    if (
      entry instanceof File &&
      entry.name.startsWith(prefix) &&
      !keep?.has(entry.name)
    ) {
      try {
        entry.delete();
        if (entry.exists) failed = true;
      } catch {
        failed = true;
      }
    }
  }
  if (keep === undefined && failed) {
    throw new Error("widget_thumbnail_cleanup_failed");
  }
}

type WidgetHost = {
  directory: string;
  publish(
    current: RecentSavesWidgetProps,
    lockedProps?: RecentSavesWidgetProps,
  ): Promise<void> | void;
};

export function hasRecentSavesWidget(): boolean {
  return Platform.OS === "ios" || Platform.OS === "android";
}

async function loadWidgetHost(): Promise<WidgetHost | null> {
  if (Platform.OS === "android") {
    const widget = recentSavesWidget;
    if (!widget) return null;
    return {
      directory: widget.getDirectory(),
      publish: (current, lockedProps) =>
        widget.setSnapshot(
          JSON.stringify({
            ...current,
            lockedTitle: lockedProps?.emptyTitle,
            lockedHint: lockedProps?.emptyHint,
          }),
        ),
    };
  }
  if (Platform.OS !== "ios") return null;
  // Metro can evaluate a dynamic import eagerly. Check the native registry
  // before touching expo-widgets so older development clients degrade safely
  // instead of crashing in ExpoWidgets.ios.js at startup.
  if (!requireOptionalNativeModule("ExpoWidgets")) return null;
  const [{ widgetsDirectory }, { default: RecentSavesWidget }] =
    await Promise.all([
      import("expo-widgets"),
      import("@/widgets/recent-saves-widget"),
    ]);
  return {
    directory: widgetsDirectory,
    publish: (current, lockedProps) => {
      if (lockedProps && current.validUntil !== undefined) {
        RecentSavesWidget.updateTimeline([
          { date: new Date(), props: current },
          { date: new Date(current.validUntil), props: lockedProps },
        ]);
      } else {
        RecentSavesWidget.updateSnapshot(current);
      }
    },
  };
}

async function syncWidget(
  items: FeedItem[],
  locked: boolean,
  generation: number,
  validUntil?: number,
): Promise<boolean> {
  if (generation !== syncGeneration) return false;
  const host = await loadWidgetHost();
  if (!host) return false;

  const dir = new Directory(host.directory);
  if (!dir.exists) dir.create({ intermediates: true });

  const widgetItems = await Promise.all(
    items.map(async (item): Promise<WidgetSaveItem> => {
      let imageUri: string | undefined;
      try {
        imageUri = await ensureThumbnail(dir, item);
      } catch (error) {
        analytics.capture("widget_sync_failed", {
          reason:
            error instanceof Error && error.message === THUMBNAIL_TIMEOUT
              ? "timeout"
              : "error",
        });
      }
      return {
        id: item._id,
        title: widgetTitle(item),
        subtitle: widgetSubtitle(item),
        kind: item.type,
        imageUri,
      };
    }),
  );

  if (generation !== syncGeneration) {
    return false;
  }

  try {
    const proEmpty = {
      emptyTitle: t("widget.proTitle"),
      emptyHint: t("widget.proBody"),
    };
    const scheme =
      Constants.expoConfig?.extra?.variant === "production"
        ? "shelvr"
        : Constants.expoConfig?.extra?.variant === "preview"
          ? "shelvr-preview"
          : "shelvr-dev";
    const current: RecentSavesWidgetProps = {
      scheme,
      items: widgetItems,
      ...(locked
        ? proEmpty
        : {
            emptyTitle: t("widget.emptyTitle"),
            emptyHint: t("widget.emptyBody"),
          }),
      locked,
      validUntil,
    };
    if (!locked && validUntil !== undefined) {
      await host.publish(current, {
        items: [],
        ...proEmpty,
        locked: true,
        scheme,
      });
    } else {
      await host.publish(current);
    }
  } finally {
    if (locked) deleteWidgetFiles(dir);
  }

  const keep = new Set(items.map((item) => `${THUMB_PREFIX}${item._id}.jpg`));
  if (!locked) deleteWidgetFiles(dir, keep);
  return true;
}

export async function clearRecentSavesWidget(): Promise<boolean> {
  if (!hasRecentSavesWidget()) return false;
  syncGeneration += 1;
  setPendingCleanup(syncGeneration);
  return startWidgetClear(syncGeneration);
}

export function retryPendingWidgetClear(): Promise<boolean> {
  if (pendingCleanup === null) return Promise.resolve(false);
  return activeClear ?? startWidgetClear(pendingCleanup);
}

function startWidgetClear(generation: number): Promise<boolean> {
  const clearing = clearWidgetAndPendingThumbnails(generation, syncChain)
    .then((cleared) => {
      if (pendingCleanup === generation) setPendingCleanup(null);
      return cleared;
    })
    .finally(() => {
      if (activeClear === clearing) activeClear = null;
    });
  activeClear = clearing;
  syncChain = clearing.catch(() => false);
  return clearing;
}

async function clearWidgetAndPendingThumbnails(
  generation: number,
  pendingSync: Promise<unknown>,
): Promise<boolean> {
  try {
    return await clearWidgetSnapshot(generation);
  } finally {
    await pendingSync;
    try {
      await clearWidgetFiles(generation);
    } catch {
      await clearWidgetFiles(generation);
    }
  }
}

async function clearWidgetFiles(generation: number): Promise<void> {
  if (generation !== syncGeneration) return;
  const host = await loadWidgetHost();
  if (!host || generation !== syncGeneration) return;
  const dir = new Directory(host.directory);
  const cache = new Directory(Paths.cache);
  const failures: unknown[] = [];
  for (const [directory, prefix] of [
    [dir, THUMB_PREFIX],
    [cache, DOWNLOAD_PREFIX],
  ] as const) {
    try {
      if (directory.exists) deleteWidgetFiles(directory, undefined, prefix);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length > 0) throw failures[0];
}

async function clearWidgetSnapshot(generation: number): Promise<boolean> {
  try {
    return await syncWidget([], true, generation);
  } catch {
    return syncWidget([], true, generation);
  }
}

let syncChain: Promise<unknown> = Promise.resolve();
let syncGeneration = 0;
let pendingCleanup: number | null = null;
let activeClear: Promise<boolean> | null = null;
const cleanupListeners = new Set<() => void>();

function setPendingCleanup(generation: number | null) {
  pendingCleanup = generation;
  for (const listener of cleanupListeners) listener();
}

function subscribeCleanup(listener: () => void) {
  cleanupListeners.add(listener);
  return () => {
    cleanupListeners.delete(listener);
  };
}

function hasPendingCleanup() {
  return pendingCleanup !== null;
}

export function RecentSavesWidgetSync() {
  const cleanupPending = useSyncExternalStore(
    subscribeCleanup,
    hasPendingCleanup,
    hasPendingCleanup,
  );
  const locale = useAppLocale();
  const {
    status,
    entitled,
    loading: entitlementLoading,
    expiresAt,
  } = useEntitlement();
  const { data: recent } = useQuery(
    convexQuery(
      api.items.listRecentItems,
      !entitlementLoading && entitled ? { limit: WIDGET_ITEM_COUNT } : "skip",
    ),
  );
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (
      !hasRecentSavesWidget() ||
      entitlementLoading ||
      (entitled && recent === undefined)
    )
      return;
    const items = entitled ? (recent ?? []) : [];
    const validUntil =
      entitled && status !== "lifetime" && expiresAt !== undefined
        ? expiresAt + WIDGET_LOCK_GRACE_MS
        : undefined;
    const key =
      locale +
      (entitled ? "open" : "locked") +
      `@${validUntil ?? ""}` +
      items
        .map(
          (item) =>
            `${item._id}:${item.title ?? ""}:${item.imageUrl ?? item.heroImageUrl ?? ""}`,
        )
        .join("|");
    if (key === lastKey.current) return;
    lastKey.current = key;

    const generation = syncGeneration;
    void retryPendingWidgetClear().catch(() => {});
    syncChain = syncChain
      .then(() => {
        if (pendingCleanup !== null) {
          lastKey.current = null;
          return false;
        }
        return syncWidget(items, !entitled, generation, validUntil);
      })
      .catch((error) => {
        lastKey.current = null;
        console.warn("Recent Saves widget sync failed", error);
      });
  }, [
    status,
    entitled,
    entitlementLoading,
    expiresAt,
    recent,
    locale,
    cleanupPending,
  ]);

  return null;
}
