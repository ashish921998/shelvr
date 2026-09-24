// @vitest-environment jsdom
// Tests for the Recent Saves widget sync. The file system, nitro image module,
// widget runtime, and query layer are all stubbed, so the tests exercise the
// observable contract: one snapshot per changed widget-visible set, mapped
// titles/subtitles, downsized thumbnails that never block the sync on
// failure, key-based dedupe, stale-thumbnail cleanup, and the key reset that
// lets a later render retry after a failed sync.
import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { File } from "expo-file-system";

import {
  clearRecentSavesWidget,
  retryPendingWidgetClear,
  RecentSavesWidgetSync,
} from "./widget-sync";
import ja from "@/locales/ja.json";

const fsx = vi.hoisted(() => ({
  platformOs: "ios",
  locale: "en-US",
  entitled: true,
  entitlementStatus: "pro" as string,
  expiresAt: undefined as number | undefined,
  entitlementLoading: false,
  nativeModulePresent: true,
  failImages: false,
  failSnapshot: false,
  snapshotFailuresRemaining: 0,
  snapshotAttempts: 0,
  onImageSaved: null as (() => void) | null,
  // When set, a thumbnail decode blocks on this gate so a test can interleave a
  // session-boundary clear with an in-flight sync.
  imageGate: null as Promise<void> | null,
  files: new Map<string, boolean>(),
  listed: [] as unknown[],
  cacheListed: [] as unknown[],
  snapshots: [] as unknown[],
  timelines: [] as { date: Date; props: unknown }[][],
  downloads: [] as string[],
  deletes: [] as string[],
  created: [] as string[],
}));
const tanstack = vi.hoisted(() => ({
  data: undefined as unknown,
  args: undefined as unknown,
}));

vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return fsx.platformOs;
    },
  },
}));
vi.mock("expo-file-system", () => {
  class File {
    name: string;
    uri: string;
    exists: boolean;
    constructor(parent: { uri?: string } | string, name: string) {
      const base =
        typeof parent === "string" ? parent : (parent?.uri ?? "file://");
      this.name = name;
      this.uri = `${base}/${name}`;
      this.exists = fsx.files.get(this.uri) ?? false;
    }
    delete() {
      fsx.deletes.push(this.uri);
      this.exists = false;
      fsx.listed = fsx.listed.filter((entry) => entry !== this);
      fsx.cacheListed = fsx.cacheListed.filter((entry) => entry !== this);
    }
    static async downloadFileAsync(url: string, target: File) {
      fsx.downloads.push(url);
      return target;
    }
  }
  class Directory {
    uri: string;
    exists: boolean;
    constructor(path: string | { uri: string }) {
      this.uri = typeof path === "string" ? `file://${path}` : path.uri;
      this.exists = fsx.files.get(this.uri) ?? true;
    }
    create() {
      fsx.created.push(this.uri);
      this.exists = true;
    }
    list() {
      return this.uri === "file:///cache" ? fsx.cacheListed : fsx.listed;
    }
  }
  return { File, Directory, Paths: { cache: { uri: "file:///cache" } } };
});
vi.mock("expo-modules-core", () => ({
  requireOptionalNativeModule: () =>
    fsx.nativeModulePresent ? { registry: true } : null,
}));
vi.mock("expo-widgets", () => ({ widgetsDirectory: "/widgets" }));
vi.mock("@/widgets/recent-saves-widget", () => ({
  default: {
    updateSnapshot: (snapshot: unknown) => {
      fsx.snapshotAttempts += 1;
      if (fsx.snapshotFailuresRemaining > 0) {
        fsx.snapshotFailuresRemaining -= 1;
        throw new Error("widget unavailable");
      }
      if (fsx.failSnapshot) throw new Error("widget unavailable");
      fsx.snapshots.push(snapshot);
    },
    updateTimeline: (entries: { date: Date; props: unknown }[]) => {
      fsx.timelines.push(entries);
    },
  },
}));
vi.mock("react-native-nitro-image", () => ({
  Images: {
    async loadFromFileAsync() {
      if (fsx.imageGate) await fsx.imageGate;
      if (fsx.failImages) throw new Error("decode failed");
      return {
        width: 1024,
        height: 2048,
        async resizeAsync(width: number, height: number) {
          return {
            width,
            height,
            async saveToFileAsync() {
              fsx.onImageSaved?.();
            },
          };
        },
      };
    },
  },
}));
vi.mock("@convex-dev/react-query", () => ({
  convexQuery: (fn: unknown, args: unknown) => {
    tanstack.args = args;
    return { queryKey: ["convexQuery", fn, args] };
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: { enabled?: boolean }) => ({
    data:
      tanstack.args === "skip" || options.enabled === false
        ? undefined
        : tanstack.data,
  }),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { listRecentItems: "listRecentItems" } },
}));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({
    status: fsx.entitlementStatus,
    expiresAt: fsx.expiresAt,
    entitled: fsx.entitled,
    loading: fsx.entitlementLoading,
    now: Date.now(),
  }),
}));

type Item = {
  _id: string;
  type: "image" | "link" | "note";
  title?: string;
  note?: string;
  url?: string;
  siteName?: string;
  imageUrl?: string | null;
  heroImageUrl?: string;
};

const link: Item = {
  _id: "i1",
  type: "link",
  title: "A save",
  url: "https://example.com/a",
  siteName: "Example",
  imageUrl: "https://cdn.example/a.jpg",
};
const note: Item = {
  _id: "i2",
  type: "note",
  note: "First line\nsecond line",
};

function renderSync(items: Item[] | undefined) {
  tanstack.data = items;
  return render(<RecentSavesWidgetSync />);
}

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: fsx.locale }],
  useLocales: () => [{ languageTag: fsx.locale }],
}));

beforeEach(async () => {
  fsx.platformOs = "ios";
  fsx.locale = "en-US";
  fsx.entitled = true;
  fsx.entitlementStatus = "pro";
  fsx.expiresAt = undefined;
  fsx.entitlementLoading = false;
  fsx.nativeModulePresent = true;
  fsx.failImages = false;
  fsx.failSnapshot = false;
  fsx.snapshotFailuresRemaining = 0;
  fsx.snapshotAttempts = 0;
  fsx.onImageSaved = null;
  fsx.imageGate = null;
  fsx.files.clear();
  fsx.listed = [];
  fsx.cacheListed = [];
  fsx.snapshots = [];
  fsx.timelines = [];
  fsx.downloads = [];
  fsx.deletes = [];
  fsx.created = [];
  tanstack.data = undefined;
  tanstack.args = undefined;
  await retryPendingWidgetClear();
  fsx.snapshots = [];
  fsx.snapshotAttempts = 0;
});

describe("RecentSavesWidgetSync", () => {
  it("refreshes localized widget copy without changing saved titles", async () => {
    const { rerender } = renderSync([{ ...note, title: "Home" }]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    fsx.locale = "ja-JP";
    rerender(<RecentSavesWidgetSync />);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(2));
    expect(fsx.snapshots[1]).toMatchObject({
      emptyTitle: ja["widget.emptyTitle"],
      emptyHint: ja["widget.emptyBody"],
      items: [{ title: "Home", subtitle: ja["item.note"] }],
    });
  });

  it("schedules a locked entry at a finite Pro expiry", async () => {
    fsx.expiresAt = Date.now() + 86_400_000;
    renderSync([note]);
    await waitFor(() => expect(fsx.timelines).toHaveLength(1));
    expect(fsx.snapshots).toHaveLength(0);
    const [live, lock] = fsx.timelines[0];
    expect(live.props).toMatchObject({
      locked: false,
      validUntil: fsx.expiresAt,
      items: [{ id: "i2" }],
    });
    expect(lock.date.getTime()).toBe(fsx.expiresAt);
    expect(lock.props).toMatchObject({ items: [], locked: true });
  });

  // A lifetime row keeps a stored expiresAt (0 from RevenueCat, or the period
  // end it had before going sticky). Treating it as a lock date would lock a
  // lifetime user's widget immediately.
  it("never schedules a lock for a lifetime entitlement", async () => {
    fsx.entitlementStatus = "lifetime";
    fsx.expiresAt = 0;
    renderSync([note]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    expect(fsx.timelines).toHaveLength(0);
    expect(fsx.snapshots[0]).toMatchObject({ locked: false });
    expect(fsx.snapshots[0]).not.toHaveProperty("validUntil", 0);
  });

  it("stays idle without data or off iOS", async () => {
    renderSync(undefined);
    fsx.platformOs = "android";
    renderSync([link]);
    // Let any (incorrectly scheduled) sync settle.
    await act(async () => {});
    expect(fsx.snapshots).toHaveLength(0);
    expect(fsx.downloads).toHaveLength(0);
  });

  // The Convex subscription outlives the component: the adapter opens it on the
  // query cache's "added" event and only drops it on "removed", which waits out
  // gcTime (24h here). TanStack's `enabled` never reaches that layer, so a
  // subscription held open across sign-out is re-evaluated without an identity
  // and the server throws "Not authenticated". The "skip" sentinel is the only
  // guard the adapter honours, because it changes the query key.
  it("opens no Convex subscription while the shelf is locked", () => {
    fsx.entitled = false;
    renderSync([link]);
    expect(tanstack.args).toBe("skip");
  });

  it("opens no Convex subscription before entitlement is known", () => {
    fsx.entitlementLoading = true;
    renderSync([link]);
    expect(tanstack.args).toBe("skip");
  });

  // The entitlement clock ticks every minute while a subscription has an
  // expiry. In the query key that was a new subscription per tick, each held
  // for gcTime.
  it("keeps one query key regardless of the entitlement clock", () => {
    renderSync([link]);
    expect(tanstack.args).toEqual({ limit: 5 });
  });

  it("does not sync until entitlement is known", async () => {
    fsx.entitlementLoading = true;
    renderSync([link]);
    await act(async () => {});
    expect(fsx.snapshots).toHaveLength(0);
    expect(fsx.downloads).toHaveLength(0);
  });

  it("clears the widget for users without Pro", async () => {
    fsx.entitled = false;
    renderSync([link]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    expect(fsx.snapshots[0]).toMatchObject({
      items: [],
      emptyTitle: "Recent saves are a Pro feature",
      emptyHint: "Subscribe to Shelvr Pro to see your saves here",
      locked: true,
    });
    expect(fsx.downloads).toHaveLength(0);
  });

  it("clears existing Pro content when entitlement is lost", async () => {
    const { rerender } = renderSync([link]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    fsx.entitled = false;
    rerender(<RecentSavesWidgetSync />);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(2));
    expect(fsx.snapshots[1]).toMatchObject({ items: [] });
  });

  it("does nothing when the widget native module is missing", async () => {
    fsx.nativeModulePresent = false;
    renderSync([link]);
    await act(async () => {});
    expect(fsx.snapshots).toHaveLength(0);
    expect(fsx.downloads).toHaveLength(0);
  });

  it("maps items into a widget snapshot with thumbnails", async () => {
    renderSync([link, note]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    const snapshot = fsx.snapshots[0] as {
      items: {
        id: string;
        title: string;
        subtitle: string;
        kind: string;
        imageUri?: string;
      }[];
    };
    expect(snapshot.items).toEqual([
      {
        id: "i1",
        title: "A save",
        subtitle: "Example",
        kind: "link",
        imageUri: "file:///widgets/recent-saves-i1.jpg",
      },
      {
        id: "i2",
        title: "First line",
        subtitle: "Note",
        kind: "note",
        imageUri: undefined,
      },
    ]);
    // The image was downloaded into the cache before resizing.
    expect(fsx.downloads).toEqual(["https://cdn.example/a.jpg"]);
  });

  it("falls back to the host and a generic label without titles", async () => {
    renderSync([
      { _id: "i3", type: "link", url: "https://news.test/x" },
      { _id: "i4", type: "image", imageUrl: null },
    ]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    const snapshot = fsx.snapshots[0] as {
      items: { title: string; subtitle: string; imageUri?: string }[];
    };
    expect(snapshot.items[0]).toMatchObject({
      title: "news.test",
      subtitle: "news.test",
      imageUri: undefined,
    });
    expect(snapshot.items[1]).toMatchObject({
      title: "Saved item",
      subtitle: "Photo",
    });
  });

  it("syncs again only when something the widget shows changed", async () => {
    const { rerender } = renderSync([link]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    rerender(<RecentSavesWidgetSync />);
    await act(async () => {});
    expect(fsx.snapshots).toHaveLength(1);

    const moved = { ...link, imageUrl: "https://cdn.example/b.jpg" };
    tanstack.data = [moved];
    rerender(<RecentSavesWidgetSync />);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(2));
  });

  it("drops thumbnails for items that left the widget", async () => {
    const stale = new File("file:///widgets", "recent-saves-stale.jpg");
    const kept = new File("file:///widgets", "recent-saves-i1.jpg");
    fsx.listed = [stale, kept];
    renderSync([link]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    expect(fsx.deletes).toContain("file:///widgets/recent-saves-stale.jpg");
    expect(fsx.deletes).not.toContain("file:///widgets/recent-saves-i1.jpg");
  });

  it("keeps the sync alive when a thumbnail fails", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    fsx.failImages = true;
    renderSync([link, note]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    const snapshot = fsx.snapshots[0] as {
      items: { id: string; imageUri?: string }[];
    };
    // The failing image degrades to the text tile; its sibling still syncs.
    expect(snapshot.items[0].imageUri).toBeUndefined();
    expect(snapshot.items[1].id).toBe("i2");
    spy.mockRestore();
  });

  it("resets the dedupe key on failure so a later render retries", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { rerender } = renderSync([link]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));

    // A changed widget set fails mid-sync: the snapshot never lands and the
    // failure clears the dedupe key.
    fsx.failSnapshot = true;
    tanstack.data = [{ ...link, title: "Renamed" }];
    rerender(<RecentSavesWidgetSync />);
    await act(async () => {});
    expect(fsx.snapshots).toHaveLength(1);
    expect(spy).toHaveBeenCalledWith(
      "Recent Saves widget sync failed",
      expect.anything(),
    );

    // The original set arrives again as a new instance; without the reset
    // its unchanged key would be skipped as an already-synced snapshot.
    fsx.failSnapshot = false;
    tanstack.data = [link];
    rerender(<RecentSavesWidgetSync />);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(2));
    spy.mockRestore();
  });

  it("does not republish when a sign-out clear lands mid-sync", async () => {
    let release!: () => void;
    fsx.imageGate = new Promise<void>((r) => (release = r));
    renderSync([link]);
    // The sync starts and blocks decoding the thumbnail.
    await act(async () => {});
    expect(fsx.downloads).toEqual(["https://cdn.example/a.jpg"]);
    expect(fsx.snapshots).toHaveLength(0);

    // A session boundary clears the widget while the sync is blocked.
    const clearing = clearRecentSavesWidget();
    await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
    expect(fsx.snapshots[0]).toMatchObject({ items: [], locked: true });

    // The stale sync unblocks but must not republish the previous account's
    // content over the cleared snapshot.
    release();
    expect(await clearing).toBe(true);
    await act(async () => {});
    expect(fsx.snapshots).toHaveLength(1);
  });
});

describe("clearRecentSavesWidget", () => {
  it("retries an already-failed clear before a newly mounted account publishes", async () => {
    fsx.snapshotFailuresRemaining = 2;
    await expect(clearRecentSavesWidget()).rejects.toThrow(
      "widget unavailable",
    );
    renderSync([{ ...note, title: "New account" }]);
    await waitFor(() => expect(fsx.snapshots).toHaveLength(2));
    expect(fsx.snapshots[0]).toMatchObject({ items: [], locked: true });
    expect(fsx.snapshots[1]).toMatchObject({
      items: [{ title: "New account" }],
      locked: false,
    });
    await act(async () => {
      expect(await retryPendingWidgetClear()).toBe(false);
    });
    expect(fsx.snapshots).toHaveLength(2);
  });

  it("removes interrupted full-size downloads without touching other cache files", async () => {
    const download = new File("file:///cache", "widget-download-old-item");
    const unrelated = new File("file:///cache", "unrelated-image.jpg");
    download.exists = true;
    unrelated.exists = true;
    fsx.cacheListed = [download, unrelated];
    const deletion = vi.spyOn(download, "delete").mockImplementationOnce(() => {
      throw new Error("temporary cache failure");
    });
    expect(await clearRecentSavesWidget()).toBe(true);
    expect(deletion).toHaveBeenCalledTimes(2);
    expect(download.exists).toBe(false);
    expect(unrelated.exists).toBe(true);
  });

  it("reports failed download cleanup and still removes shared thumbnails", async () => {
    const download = new File("file:///cache", "widget-download-old-item");
    const thumbnail = new File("file:///widgets", "recent-saves-old-item.jpg");
    download.exists = true;
    thumbnail.exists = true;
    fsx.cacheListed = [download];
    fsx.listed = [thumbnail];
    vi.spyOn(download, "delete").mockImplementation(() => {
      throw new Error("private path");
    });
    await expect(clearRecentSavesWidget()).rejects.toThrow(
      "widget_thumbnail_cleanup_failed",
    );
    expect(thumbnail.exists).toBe(false);
    expect(download.exists).toBe(true);
  });

  it.each([false, true])(
    "includes late thumbnail cleanup in the clear result (persistent failure: %s)",
    async (persistentFailure) => {
      let release!: () => void;
      fsx.imageGate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const thumbnail = new File("file:///widgets", "recent-saves-i1.jpg");
      const deletion = vi.spyOn(thumbnail, "delete");
      const failDelete = () => {
        throw new Error("private file path");
      };
      if (persistentFailure) deletion.mockImplementation(failDelete);
      else deletion.mockImplementationOnce(failDelete);
      fsx.onImageSaved = () => {
        thumbnail.exists = true;
        fsx.listed = [thumbnail];
      };

      const oldSession = renderSync([link]);
      await waitFor(() => expect(fsx.downloads).toHaveLength(1));
      oldSession.unmount();
      let settled = false;
      const clearing = clearRecentSavesWidget().then(
        (value) => {
          settled = true;
          return value;
        },
        (error: unknown) => {
          settled = true;
          return error;
        },
      );
      await waitFor(() => expect(fsx.snapshots).toHaveLength(1));
      expect(fsx.snapshots[0]).toMatchObject({ items: [], locked: true });
      expect(settled).toBe(false);
      renderSync([{ ...note, title: "Next account" }]);
      await act(async () => {});
      expect(fsx.snapshots).toHaveLength(1);

      release();
      if (persistentFailure) {
        expect(await clearing).toEqual(
          new Error("widget_thumbnail_cleanup_failed"),
        );
        expect(thumbnail.exists).toBe(true);
      } else {
        expect(await clearing).toBe(true);
        expect(thumbnail.exists).toBe(false);
      }
      expect(deletion).toHaveBeenCalledTimes(2);
      if (persistentFailure) {
        expect(fsx.snapshots).toHaveLength(1);
        deletion.mockRestore();
        await act(async () => {
          await retryPendingWidgetClear();
        });
      }
      await waitFor(() =>
        expect(fsx.snapshots).toHaveLength(persistentFailure ? 3 : 2),
      );
      expect(fsx.snapshots.at(-1)).toMatchObject({
        locked: false,
        items: [{ title: "Next account" }],
      });
    },
  );

  it("retries a failed thumbnail deletion before reporting success", async () => {
    const thumbnail = new File("file:///widgets", "recent-saves-private.jpg");
    thumbnail.exists = true;
    fsx.listed = [thumbnail];
    const deletion = vi
      .spyOn(thumbnail, "delete")
      .mockImplementationOnce(() => {
        throw new Error("private file path");
      });

    expect(await clearRecentSavesWidget()).toBe(true);
    expect(deletion).toHaveBeenCalledTimes(2);
    expect(thumbnail.exists).toBe(false);
  });

  it("reports persistent deletion failures while still removing other thumbnails", async () => {
    const retained = new File("file:///widgets", "recent-saves-private.jpg");
    const removed = new File("file:///widgets", "recent-saves-other.jpg");
    retained.exists = true;
    removed.exists = true;
    fsx.listed = [retained, removed];
    const deletion = vi.spyOn(retained, "delete").mockImplementation(() => {
      throw new Error("private file path");
    });

    await expect(clearRecentSavesWidget()).rejects.toThrow(
      "widget_thumbnail_cleanup_failed",
    );
    expect(deletion).toHaveBeenCalledTimes(4);
    expect(retained.exists).toBe(true);
    expect(removed.exists).toBe(false);
    expect(fsx.snapshots.at(-1)).toMatchObject({ items: [], locked: true });
  });

  it("verifies that deletion actually removed the thumbnail", async () => {
    const thumbnail = new File("file:///widgets", "recent-saves-private.jpg");
    thumbnail.exists = true;
    fsx.listed = [thumbnail];
    vi.spyOn(thumbnail, "delete").mockImplementation(() => {});

    await expect(clearRecentSavesWidget()).rejects.toThrow(
      "widget_thumbnail_cleanup_failed",
    );
  });

  it.each([0, 1])(
    "publishes a new session after a clear with %i transient failures",
    async (failures) => {
      fsx.snapshotFailuresRemaining = failures;
      const clearing = clearRecentSavesWidget();
      const { rerender } = renderSync([{ ...note, title: "New account" }]);
      await act(async () => {
        expect(await clearing).toBe(true);
      });
      await waitFor(() => expect(fsx.snapshots).toHaveLength(2));
      expect(fsx.snapshots).toEqual([
        expect.objectContaining({ items: [], locked: true }),
        expect.objectContaining({
          items: [expect.objectContaining({ title: "New account" })],
          locked: false,
        }),
      ]);
      tanstack.data = [{ ...note, title: "New account" }];
      rerender(<RecentSavesWidgetSync />);
      await act(async () => {});
      expect(fsx.snapshots).toHaveLength(2);
    },
  );

  it("keeps a new session behind failed cleanup and resumes after recovery", async () => {
    fsx.snapshotFailuresRemaining = 2;
    const clearing = clearRecentSavesWidget();
    renderSync([{ ...note, title: "New account" }]);
    await act(async () => {
      await expect(clearing).rejects.toThrow("widget unavailable");
    });
    expect(fsx.snapshots).toHaveLength(0);
    await act(async () => {
      expect(await retryPendingWidgetClear()).toBe(true);
    });
    await waitFor(() => expect(fsx.snapshots).toHaveLength(2));
    expect(fsx.snapshots[1]).toMatchObject({
      items: [{ title: "New account" }],
      locked: false,
    });
    expect(fsx.snapshotAttempts).toBe(4);
    await act(async () => {
      expect(await retryPendingWidgetClear()).toBe(false);
    });
    expect(fsx.snapshots).toHaveLength(2);
  });

  it("retries a transient snapshot failure", async () => {
    fsx.snapshotFailuresRemaining = 1;
    expect(await clearRecentSavesWidget()).toBe(true);
    expect(fsx.snapshotAttempts).toBe(2);
    expect(fsx.snapshots).toEqual([
      expect.objectContaining({ items: [], locked: true }),
    ]);
  });

  it("still deletes private thumbnails when snapshot publication keeps failing", async () => {
    fsx.failSnapshot = true;
    fsx.listed = [new File("file:///widgets", "recent-saves-i1.jpg")];
    await expect(clearRecentSavesWidget()).rejects.toThrow(
      "widget unavailable",
    );
    expect(fsx.snapshotAttempts).toBe(2);
    expect(fsx.snapshots).toHaveLength(0);
    expect(fsx.deletes).toContain("file:///widgets/recent-saves-i1.jpg");
  });

  it("publishes the locked snapshot and drops every thumbnail on iOS", async () => {
    fsx.listed = [
      new File("file:///widgets", "recent-saves-i1.jpg"),
      new File("file:///widgets", "recent-saves-i2.jpg"),
      new File("file:///widgets", "keep-me.txt"),
    ];
    expect(await clearRecentSavesWidget()).toBe(true);
    expect(fsx.snapshots).toHaveLength(1);
    expect(fsx.snapshots[0]).toMatchObject({
      items: [],
      emptyTitle: "Recent saves are a Pro feature",
      emptyHint: "Subscribe to Shelvr Pro to see your saves here",
      locked: true,
    });
    expect(fsx.deletes).toEqual([
      "file:///widgets/recent-saves-i1.jpg",
      "file:///widgets/recent-saves-i2.jpg",
    ]);
  });

  it("does nothing off iOS", async () => {
    fsx.platformOs = "android";
    expect(await clearRecentSavesWidget()).toBe(false);
    expect(fsx.snapshots).toHaveLength(0);
  });

  it("does nothing when the widget native module is missing", async () => {
    fsx.nativeModulePresent = false;
    expect(await clearRecentSavesWidget()).toBe(false);
    expect(fsx.snapshots).toHaveLength(0);
  });
});
