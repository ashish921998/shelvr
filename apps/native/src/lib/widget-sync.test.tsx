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

import { RecentSavesWidgetSync } from "./widget-sync";

const fsx = vi.hoisted(() => ({
  platformOs: "ios",
  nativeModulePresent: true,
  failImages: false,
  failSnapshot: false,
  files: new Map<string, boolean>(),
  listed: [] as unknown[],
  snapshots: [] as unknown[],
  downloads: [] as string[],
  deletes: [] as string[],
  created: [] as string[],
}));
const tanstack = vi.hoisted(() => ({ data: undefined as unknown }));

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
    }
    static async downloadFileAsync(url: string, target: File) {
      fsx.downloads.push(url);
      return target;
    }
  }
  class Directory {
    uri: string;
    exists: boolean;
    constructor(path: string) {
      this.uri = `file://${path}`;
      this.exists = fsx.files.get(this.uri) ?? true;
    }
    create() {
      fsx.created.push(this.uri);
      this.exists = true;
    }
    list() {
      return fsx.listed;
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
      if (fsx.failSnapshot) throw new Error("widget unavailable");
      fsx.snapshots.push(snapshot);
    },
  },
}));
vi.mock("react-native-nitro-image", () => ({
  Images: {
    async loadFromFileAsync() {
      if (fsx.failImages) throw new Error("decode failed");
      return {
        width: 1024,
        height: 2048,
        async resizeAsync(width: number, height: number) {
          return {
            width,
            height,
            async saveToFileAsync() {},
          };
        },
      };
    },
  },
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: tanstack.data }),
}));
vi.mock("@convex/_generated/api", () => ({
  api: { items: { listRecentItems: "listRecentItems" } },
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

beforeEach(() => {
  fsx.platformOs = "ios";
  fsx.nativeModulePresent = true;
  fsx.failImages = false;
  fsx.failSnapshot = false;
  fsx.files.clear();
  fsx.listed = [];
  fsx.snapshots = [];
  fsx.downloads = [];
  fsx.deletes = [];
  fsx.created = [];
  tanstack.data = undefined;
});

describe("RecentSavesWidgetSync", () => {
  it("stays idle without data or off iOS", async () => {
    renderSync(undefined);
    fsx.platformOs = "android";
    renderSync([link]);
    // Let any (incorrectly scheduled) sync settle.
    await act(async () => {});
    expect(fsx.snapshots).toHaveLength(0);
    expect(fsx.downloads).toHaveLength(0);
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
});
