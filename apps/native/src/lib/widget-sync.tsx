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

const WIDGET_ITEM_COUNT = 5;
const THUMB_PREFIX = "recent-saves-";
const DOWNLOAD_PREFIX = "widget-download-";
const THUMB_MAX_DIM = 512;
// A stalled download or a wedged native decode must never hang a thumbnail
// forever. The sign-out clear waits on the in-flight sync, so one unbounded
// thumbnail leaves the widget stuck empty until the app relaunches. Bound the
// work so a timed-out thumbnail degrades to the text tile like any other
// failure.
const THUMBNAIL_TIMEOUT_MS = 30_000;
const THUMBNAIL_TIMEOUT = "widget_thumbnail_timeout";

// Numbers each thumbnail build so its private working files never collide with
// a newer build for the same item.
let thumbnailAttempt = 0;

// Widget extensions have a hard memory cap (~30 MB), so full-size photos are
// downsized to widget-friendly JPEGs before they enter the shared container.
async function ensureThumbnail(
  dir: Directory,
  item: FeedItem,
): Promise<string | undefined> {
  const url = item.imageUrl ?? item.heroImageUrl;
  if (!url) return undefined;
  const thumb = new File(dir, `${THUMB_PREFIX}${item._id}.jpg`);
  if (thumb.exists) return thumb.uri;

  // Build in the app's private cache and move the result into the shared
  // container only once it beats the deadline. A timed-out build keeps running
  // (there is no abort API for the download or the native decode), so it must
  // never write into the container itself: a sign-out clear could already have
  // run. Both working files carry DOWNLOAD_PREFIX, so the clear sweeps them too.
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
    // The losing side of the race stays handled because Promise.race keeps a
    // handler on both inputs.
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
    // Failed or abandoned, the staged file is never used. An abandoned build
    // may still write it, so remove it once the build settles.
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

// Working files live in the private cache, and the sign-out clear sweeps any
// that survive, so a failed delete here is not worth failing a sync over.
function deleteQuietly(file: File) {
  try {
    if (file.exists) file.delete();
  } catch {
    // Swept by clearWidgetFiles at the next session boundary.
  }
}

function toPlainPath(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}

function widgetTitle(item: FeedItem): string {
  if (item.title) return item.title;
  if (item.type === "note" && item.note)
    return item.note.split("\n")[0].slice(0, 80);
  if (item.type === "link") return displayHost(item.url) || t("item.link");
  return t("item.savedItem");
}

function widgetSubtitle(item: FeedItem): string {
  if (item.type === "link")
    return item.siteName || displayHost(item.url) || t("item.link");
  if (item.type === "note") return t("item.note");
  return t("item.photo");
}

// Full clears surface failures; routine pruning with a keep set is best effort.
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
  // Normal pruning is best effort. A full privacy clear must surface failures
  // after trying every file so the caller retries and cannot report success.
  if (keep === undefined && failed) {
    throw new Error("widget_thumbnail_cleanup_failed");
  }
}

// Publishes one widget snapshot for `items` (empty + `locked` clears it) and
// prunes thumbnails the snapshot no longer references. Resolves to `true` once
// the snapshot is published, or `false` if it bailed — the widget module is
// missing, or a session boundary bumped the generation past this call.
async function syncWidget(
  items: FeedItem[],
  locked: boolean,
  generation: number,
): Promise<boolean> {
  // A sign-out between this sync being queued and running owns the widget now;
  // don't rebuild the previous account's snapshot over the cleared one.
  if (generation !== syncGeneration) return false;
  // Metro can evaluate a dynamic import eagerly. Check the native registry
  // before touching expo-widgets so older development clients degrade safely
  // instead of crashing in ExpoWidgets.ios.js at startup.
  if (!requireOptionalNativeModule("ExpoWidgets")) return false;

  const [{ widgetsDirectory }, { default: RecentSavesWidget }] =
    await Promise.all([
      import("expo-widgets"),
      import("@/widgets/recent-saves-widget"),
    ]);

  const dir = new Directory(widgetsDirectory);
  if (!dir.exists) dir.create({ intermediates: true });

  const widgetItems = await Promise.all(
    items.map(async (item) => {
      let imageUri: string | undefined;
      try {
        imageUri = await ensureThumbnail(dir, item);
      } catch (error) {
        // A failed thumbnail falls back to the text tile; never block the sync.
        // Record the reason so the timeout path is measurable in production.
        analytics.capture("widget_sync_failed", {
          reason:
            error instanceof Error && error.message === THUMBNAIL_TIMEOUT
              ? "timeout"
              : "error",
        });
      }
      return {
        id: item._id as string,
        title: widgetTitle(item),
        subtitle: widgetSubtitle(item),
        kind: item.type,
        imageUri,
      };
    }),
  );

  // A sign-out may have cleared the widget while the thumbnails downloaded.
  // The session-boundary clear waits for this work and owns its final cleanup.
  if (generation !== syncGeneration) {
    return false;
  }

  try {
    RecentSavesWidget.updateSnapshot({
      items: widgetItems,
      emptyTitle: t(locked ? "widget.proTitle" : "widget.emptyTitle"),
      emptyHint: t(locked ? "widget.proBody" : "widget.emptyBody"),
      locked,
    });
  } finally {
    // Clearing private files must not depend on publishing the locked snapshot.
    if (locked) deleteWidgetFiles(dir);
  }

  // Drop thumbnails for items that left the widget so the shared container
  // doesn't grow forever. Run after updateSnapshot so the old snapshot's
  // referenced files stay valid until the new one is live.
  const keep = new Set(items.map((item) => `${THUMB_PREFIX}${item._id}.jpg`));
  if (!locked) deleteWidgetFiles(dir, keep);
  return true;
}

/**
 * The session-boundary widget clear, owned by `useAnalyticsIdentity` and run
 * when Convex Auth reports signed out. A widget snapshot and its thumbnails
 * outlive both the app and the auth session, so without this the previous
 * account's saved titles and photos stay readable on the Home Screen — and on
 * disk in the shared container — until a later sign-in. Bumps the sync
 * generation first so a `syncWidget` queued or in flight before this boundary
 * cannot republish the cleared snapshot, then publishes the empty locked
 * snapshot (which also drops every thumbnail). Resolves to `true` once the
 * snapshot is published and thumbnail cleanup succeeds (iOS with the widget
 * module linked), so the caller can record the boundary.
 */
export async function clearRecentSavesWidget(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
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
  // Clear immediately, but make subsequent sessions wait for both the clear
  // (including its retry) and any old thumbnail work before publishing.
  // Keep failures observable to the caller without poisoning the sync queue.
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
    // Old native image work can write files after the immediate clear. Include
    // its final cleanup in the result observed by telemetry and newer sessions.
    try {
      await clearWidgetFiles(generation);
    } catch {
      await clearWidgetFiles(generation);
    }
  }
}

async function clearWidgetFiles(generation: number): Promise<void> {
  if (
    generation !== syncGeneration ||
    !requireOptionalNativeModule("ExpoWidgets")
  )
    return;
  const { widgetsDirectory } = await import("expo-widgets");
  if (generation !== syncGeneration) return;
  const dir = new Directory(widgetsDirectory);
  const cache = new Directory(Paths.cache);
  // Try both locations even if one fails. Never delete unrelated app cache.
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
    // Retry once for a transient native failure, retaining the boundary's
    // generation so a newer clear can still invalidate this attempt.
    return syncWidget([], true, generation);
  }
}

// Serialize syncs so a fast series of Convex pushes can't interleave file work.
let syncChain: Promise<unknown> = Promise.resolve();
// Bumped by clearRecentSavesWidget at the session boundary. A sync captures the
// value when it is queued and bails if it no longer matches, so a sign-out can
// never be overwritten by a sync that started before it.
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

/**
 * Keeps the "Recent Saves" home screen widget fed with the latest ready items.
 * Renders nothing; mount once inside the signed-in tree. It subscribes to its
 * own five-item query rather than the feed, so a change deep in the library
 * never re-sends the whole feed here.
 */
export function RecentSavesWidgetSync() {
  const cleanupPending = useSyncExternalStore(
    subscribeCleanup,
    hasPendingCleanup,
    hasPendingCleanup,
  );
  const locale = useAppLocale();
  const { entitled, loading: entitlementLoading } = useEntitlement();
  // "skip" rather than TanStack's `enabled`: the Convex adapter ignores
  // `enabled` entirely. It opens its subscription from the query cache's
  // "added" event and drops it on "removed", so an `enabled: false` query
  // still holds a live server subscription. The sentinel changes the query
  // key, which is the only guard the adapter reads, so no subscription is
  // opened at all. Switching to it does not close a subscription already
  // open under real arguments; sign-out clears those through the
  // removeQueries call in analytics-identity.ts.
  //
  // The entitlement clock is deliberately not an argument. It ticks every
  // minute whenever a subscription carries an expiry, and the adapter hashes
  // the whole argument object, so every tick would mint another key and
  // another subscription, each held for gcTime. Dropping it moves the server
  // to the stored subscription status, which the RevenueCat webhook lapses,
  // so an expired row still reads as Pro until that webhook lands. Passing
  // the clock did not close that window either, since it was the client's
  // own clock.
  const { data: recent } = useQuery(
    convexQuery(
      api.items.listRecentItems,
      !entitlementLoading && entitled ? { limit: WIDGET_ITEM_COUNT } : "skip",
    ),
  );
  const lastKey = useRef<string | null>(null);

  useEffect(() => {
    if (
      Platform.OS !== "ios" ||
      entitlementLoading ||
      (entitled && recent === undefined)
    )
      return;
    // A widget snapshot survives independently of the app. Clear it when a
    // subscription lapses or the user signs out so old Pro content is not
    // left visible on the Home Screen.
    const items = entitled ? (recent ?? []) : [];
    // Only re-sync when something the widget shows actually changed.
    const key =
      locale +
      (entitled ? "open" : "locked") +
      items
        .map(
          (item) =>
            `${item._id}:${item.title ?? ""}:${item.imageUrl ?? item.heroImageUrl ?? ""}`,
        )
        .join("|");
    if (key === lastKey.current) return;
    lastKey.current = key;

    const generation = syncGeneration;
    // A new session must finish a failed previous clear before publishing.
    // Recovery keeps the generation, so it cannot invalidate the new snapshot.
    void retryPendingWidgetClear().catch(() => {});
    syncChain = syncChain
      .then(() => {
        if (pendingCleanup !== null) {
          lastKey.current = null;
          return false;
        }
        return syncWidget(items, !entitled, generation);
      })
      .catch((error) => {
        lastKey.current = null;
        console.warn("Recent Saves widget sync failed", error);
      });
  }, [entitled, entitlementLoading, recent, locale, cleanupPending]);

  return null;
}
