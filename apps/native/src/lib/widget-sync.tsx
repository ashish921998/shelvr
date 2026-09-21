import { t, useAppLocale } from "./i18n";
import type { FeedItem } from "@/components/item-card";
import { useEntitlement } from "@/lib/entitlement";
import { displayHost } from "@/lib/url";
import { api } from "@convex/_generated/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { Directory, File, Paths } from "expo-file-system";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { Images } from "react-native-nitro-image";

const WIDGET_ITEM_COUNT = 5;
const THUMB_PREFIX = "recent-saves-";
const THUMB_MAX_DIM = 512;

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

  const download = new File(Paths.cache, `widget-download-${item._id}`);
  try {
    if (download.exists) download.delete();
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
    await resized.saveToFileAsync(toPlainPath(thumb.uri), "jpg", 80);
    return thumb.uri;
  } finally {
    if (download.exists) download.delete();
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

// Drop `recent-saves-` thumbnails from the shared container. With `keep`, only
// entries not in the set go (the running-total cleanup after a sync); without
// it, every thumbnail goes (the session-boundary clear).
function deleteThumbnails(dir: Directory, keep?: Set<string>) {
  for (const entry of dir.list()) {
    if (
      entry instanceof File &&
      entry.name.startsWith(THUMB_PREFIX) &&
      !keep?.has(entry.name)
    ) {
      try {
        entry.delete();
      } catch {
        // Best effort; a stale thumbnail is harmless.
      }
    }
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
        console.warn(`Widget thumbnail failed for ${item._id}`, error);
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
  // Drop anything this stale sync wrote and leave the cleared snapshot standing
  // rather than republishing the previous account's saves.
  if (generation !== syncGeneration) {
    deleteThumbnails(dir);
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
    if (locked) deleteThumbnails(dir);
  }

  // Drop thumbnails for items that left the widget so the shared container
  // doesn't grow forever. Run after updateSnapshot so the old snapshot's
  // referenced files stay valid until the new one is live.
  const keep = new Set(items.map((item) => `${THUMB_PREFIX}${item._id}.jpg`));
  if (!locked) deleteThumbnails(dir, keep);
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
 * snapshot (which also drops every thumbnail). Resolves to `true` once that
 * snapshot is published (iOS with the widget module linked), so the caller can
 * record the boundary.
 */
export async function clearRecentSavesWidget(): Promise<boolean> {
  syncGeneration += 1;
  if (Platform.OS !== "ios") return false;
  const clearing = clearWidgetSnapshot(syncGeneration);
  // Clear immediately, but make subsequent sessions wait for both the clear
  // (including its retry) and any old thumbnail work before publishing.
  // Keep failures observable to the caller without poisoning the sync queue.
  syncChain = Promise.all([syncChain, clearing.catch(() => false)]);
  return clearing;
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

/**
 * Keeps the "Recent Saves" home screen widget fed with the latest ready items.
 * Renders nothing; mount once inside the signed-in tree. It subscribes to its
 * own five-item query rather than the feed, so a change deep in the library
 * never re-sends the whole feed here.
 */
export function RecentSavesWidgetSync() {
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
    syncChain = syncChain
      .then(() => syncWidget(items, !entitled, generation))
      .catch((error) => {
        lastKey.current = null;
        console.warn("Recent Saves widget sync failed", error);
      });
  }, [entitled, entitlementLoading, recent, locale]);

  return null;
}
