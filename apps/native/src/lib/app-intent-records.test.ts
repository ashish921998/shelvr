import type { Id } from "@convex/_generated/dataModel";
import { MAX_URL_LENGTH } from "@convex/model/externalUrl";
import type { AppIntentInvocation } from "expo-app-intents";
import { describe, expect, it, vi } from "vitest";
import {
  type CatalogItem,
  invocationOperationId,
  isSavableUrl,
  itemRecord,
  itemTitle,
  param,
  spaceParam,
  spaceRecord,
  stagedImagePaths,
  wantedThumbnails,
} from "./app-intent-records";

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));

function item(overrides: Partial<CatalogItem> = {}): CatalogItem {
  return {
    _id: "items:1" as Id<"items">,
    _creationTime: 1_700_000_000_123.6,
    type: "link",
    tags: [],
    ...overrides,
  } as CatalogItem;
}

function invocation(
  params: Record<string, unknown>,
  id = "inv-1",
): AppIntentInvocation {
  return { id, name: "saveLink", params, createdAt: 0 } as AppIntentInvocation;
}

describe("itemTitle", () => {
  it("prefers the trimmed title", () => {
    expect(itemTitle(item({ title: "  Ramen guide  " }))).toBe("Ramen guide");
  });

  it("uses a note's first line, capped at 80 characters", () => {
    expect(
      itemTitle(item({ type: "note", note: "\n Buy miso\nand nori" })),
    ).toBe("Buy miso");
    expect(itemTitle(item({ type: "note", note: "x".repeat(120) }))).toBe(
      "x".repeat(80),
    );
  });

  it("names a note with no text on its first line generically", () => {
    expect(itemTitle(item({ type: "note", note: "   " }))).toBe("item.note");
  });

  it("uses a link's host, or a generic name when there is none", () => {
    expect(
      itemTitle(item({ url: "https://www.example.com/recipes/ramen" })),
    ).toBe("example.com");
    expect(itemTitle(item({ url: undefined }))).toBe("item.link");
  });

  it("names an untitled image generically", () => {
    expect(itemTitle(item({ type: "image" }))).toBe("item.savedItem");
  });
});

describe("itemRecord", () => {
  it("carries the metadata the Swift catalog reads", () => {
    expect(
      itemRecord(
        item({
          title: "Ramen",
          description: "  Tonkotsu at home ",
          url: "https://example.com/ramen",
          siteName: "Example",
          note: "n".repeat(700),
          imageUrl: "https://img.example.com/a.jpg",
          heroImageUrl: "https://img.example.com/hero.jpg",
          tags: [" ramen ", "ramen", "", "dinner"],
        }),
      ),
    ).toEqual({
      id: "items:1",
      title: "Ramen",
      subtitle: "Tonkotsu at home",
      synonyms: ["ramen", "dinner"],
      metadata: {
        kind: "link",
        savedAt: "1700000000124",
        url: "https://example.com/ramen",
        site: "Example",
        text: "n".repeat(600),
        imageUrl: "https://img.example.com/a.jpg",
      },
    });
  });

  it("falls back to the hero image and the site name, and omits what is absent", () => {
    expect(
      itemRecord(
        item({
          title: "Ramen",
          description: "   ",
          siteName: "Example",
          heroImageUrl: "https://img.example.com/hero.jpg",
        }),
      ),
    ).toEqual({
      id: "items:1",
      title: "Ramen",
      subtitle: "Example",
      synonyms: [],
      metadata: {
        kind: "link",
        savedAt: "1700000000124",
        site: "Example",
        imageUrl: "https://img.example.com/hero.jpg",
      },
    });
    expect(itemRecord(item({ title: "Ramen" })).subtitle).toBeUndefined();
  });

  it("keeps at most 12 distinct tags", () => {
    const tags = Array.from({ length: 20 }, (_, i) => `tag${i}`);
    expect(itemRecord(item({ tags })).synonyms).toEqual(tags.slice(0, 12));
  });
});

describe("spaceRecord", () => {
  it("trims the name and description", () => {
    expect(
      spaceRecord({
        _id: "spaces:1" as Id<"spaces">,
        name: " Tokyo ",
        description: " Trip in May ",
      }),
    ).toEqual({ id: "spaces:1", title: "Tokyo", subtitle: "Trip in May" });
  });

  it("names a blank space generically and drops a blank description", () => {
    expect(
      spaceRecord({
        _id: "spaces:1" as Id<"spaces">,
        name: "  ",
        description: "  ",
      }),
    ).toEqual({ id: "spaces:1", title: "item.savedItem", subtitle: undefined });
  });
});

describe("wantedThumbnails", () => {
  it("keys each image by item id, skipping saves with none, up to the limit", () => {
    const items = [
      item({ _id: "items:a" as Id<"items">, imageUrl: "https://i/a" }),
      item({ _id: "items:b" as Id<"items"> }),
      item({ _id: "items:c" as Id<"items">, heroImageUrl: "https://i/c" }),
      item({ _id: "items:d" as Id<"items">, imageUrl: "https://i/d" }),
    ];
    expect([...wantedThumbnails(items, 2)]).toEqual([
      ["items:a.jpg", "https://i/a"],
      ["items:c.jpg", "https://i/c"],
    ]);
  });
});

describe("invocation params", () => {
  it("reads only non-empty strings", () => {
    const inv = invocation({ text: "hi", empty: "", count: 3 });
    expect(param(inv, "text")).toBe("hi");
    expect(param(inv, "empty")).toBeUndefined();
    expect(param(inv, "count")).toBeUndefined();
    expect(param(inv, "missing")).toBeUndefined();
  });

  it("reads the space id", () => {
    expect(spaceParam(invocation({ spaceId: "spaces:9" }))).toBe("spaces:9");
    expect(spaceParam(invocation({}))).toBeUndefined();
  });

  it("uses the sent operation id, or derives one from the invocation id", () => {
    expect(invocationOperationId(invocation({ operationId: "op-7" }))).toBe(
      "op-7",
    );
    expect(invocationOperationId(invocation({}, "inv-42"))).toBe("siri:inv-42");
  });
});

describe("isSavableUrl", () => {
  it("accepts web links up to the server's length limit", () => {
    expect(isSavableUrl("https://example.com")).toBe(true);
    expect(isSavableUrl("HTTP://example.com")).toBe(true);
    expect(isSavableUrl("  https://example.com")).toBe(true);
    const prefix = "https://example.com/";
    expect(
      isSavableUrl(prefix + "a".repeat(MAX_URL_LENGTH - prefix.length)),
    ).toBe(true);
    expect(
      isSavableUrl(prefix + "a".repeat(MAX_URL_LENGTH - prefix.length + 1)),
    ).toBe(false);
  });

  it("refuses other schemes", () => {
    expect(isSavableUrl("ftp://example.com")).toBe(false);
    expect(isSavableUrl("javascript:alert(1)")).toBe(false);
    expect(isSavableUrl("example.com")).toBe(false);
  });
});

describe("stagedImagePaths", () => {
  it("pairs each path with its sent operation id", () => {
    expect(
      stagedImagePaths(
        invocation({ paths: ["/a.jpg", "/b.jpg"], operationIds: ["x", "y"] }),
        "siri:inv-1",
      ),
    ).toEqual([
      { path: "/a.jpg", operationId: "x" },
      { path: "/b.jpg", operationId: "y" },
    ]);
  });

  it("derives an id by position when one is missing, empty or not a string", () => {
    expect(
      stagedImagePaths(
        invocation({
          paths: ["/a.jpg", 5, "/c.jpg", "/d.jpg"],
          operationIds: ["x", "unused", ""],
        }),
        "siri:inv-1",
      ),
    ).toEqual([
      { path: "/a.jpg", operationId: "x" },
      { path: "/c.jpg", operationId: "siri:inv-1:2" },
      { path: "/d.jpg", operationId: "siri:inv-1:3" },
    ]);
    expect(
      stagedImagePaths(
        invocation({ paths: ["/a.jpg"], operationIds: "x" }),
        "op",
      ),
    ).toEqual([{ path: "/a.jpg", operationId: "op:0" }]);
  });

  it("treats absent or malformed paths as none", () => {
    expect(stagedImagePaths(invocation({}), "op")).toEqual([]);
    expect(stagedImagePaths(invocation({ paths: "/a.jpg" }), "op")).toEqual([]);
  });
});
