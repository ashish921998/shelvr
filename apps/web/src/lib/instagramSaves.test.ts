import { deflateRawSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import {
  fixMojibake,
  isZip,
  matchesQuery,
  mergeSaves,
  parseSavesFile,
  postUrl,
  readSaves,
  savedFilesInZip,
  summarize,
  toCsv,
  type ZipSource,
} from "./instagramSaves";

const savedPosts = JSON.stringify({
  saved_saved_media: [
    {
      title: "chef.anna",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/p/AAA/?igsh=x",
          timestamp: 1690000000,
        },
      },
    },
    {
      title: "travel.jo",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/reels/BBB/",
          timestamp: 1420070400,
        },
      },
    },
    {
      title: "chef.anna",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/p/CCC/",
          timestamp: 1700000000,
        },
      },
    },
    { title: "broken", string_map_data: { "Saved on": { href: "nope" } } },
    {
      title: "plants.daily",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/p/FFF/",
          timestamp: 1650000000,
        },
      },
    },
  ],
});

const savedCollections = JSON.stringify({
  saved_saved_collections: [
    {
      title: "Collection",
      string_map_data: {
        Name: { value: "Recipes" },
        "Creation Time": { timestamp: 1680000000 },
      },
    },
    {
      title: "chef.anna",
      string_map_data: {
        Name: { href: "https://www.instagram.com/p/AAA/", value: "chef.anna" },
        "Added Time": { timestamp: 1690000100 },
      },
    },
    {
      title: "Collection",
      string_map_data: { Name: { value: "Lisbon trip" } },
    },
    {
      title: "travel.jo",
      string_map_data: {
        Name: {
          href: "https://www.instagram.com/reel/BBB/",
          value: "travel.jo",
        },
      },
    },
  ],
});

describe("postUrl", () => {
  it("keeps only Instagram post, reel and video links, without tracking", () => {
    expect(postUrl("https://instagram.com/p/AbC_1-/?igsh=1")).toBe(
      "https://www.instagram.com/p/AbC_1-/",
    );
    expect(postUrl("https://www.instagram.com/reels/XYZ")).toBe(
      "https://www.instagram.com/reel/XYZ/",
    );
    expect(postUrl("https://www.instagram.com/chef.anna/p/XYZ/")).toBe(
      "https://www.instagram.com/p/XYZ/",
    );
    expect(postUrl("https://www.instagram.com/chef.anna/")).toBeUndefined();
    expect(postUrl("https://evil.com/p/XYZ/")).toBeUndefined();
    expect(postUrl(42)).toBeUndefined();
  });
});

describe("parseSavesFile", () => {
  it("reads saved_posts.json", () => {
    const saves = parseSavesFile("saved_posts.json", savedPosts);
    expect(saves).toHaveLength(4);
    // A record without a usable link is skipped, not read as a collection.
    expect(saves[3].collections).toEqual([]);
    expect(saves[0]).toEqual({
      url: "https://www.instagram.com/p/AAA/",
      kind: "post",
      author: "chef.anna",
      savedAt: 1690000000 * 1000,
      collections: [],
    });
    expect(saves[1].kind).toBe("reel");
  });

  it("files posts under the collection named before them", () => {
    const saves = parseSavesFile("saved_collections.json", savedCollections);
    expect(saves.map((save) => [save.author, save.collections])).toEqual([
      ["chef.anna", ["Recipes"]],
      ["travel.jo", ["Lisbon trip"]],
    ]);
  });

  it("reads the label_values shape Meta also ships", () => {
    const text = JSON.stringify([
      {
        timestamp: 1700000000,
        label_values: [
          { label: "Username", value: "maker.lu" },
          { label: "URL", value: "https://www.instagram.com/p/DDD/" },
        ],
      },
    ]);
    expect(parseSavesFile("saved_posts.json", text)).toEqual([
      {
        url: "https://www.instagram.com/p/DDD/",
        kind: "post",
        author: "maker.lu",
        savedAt: 1700000000 * 1000,
        collections: [],
      },
    ]);
  });

  it("reads links from the HTML download", () => {
    const html =
      '<div><a target="_blank" href="https://www.instagram.com/p/EEE/">x</a>' +
      '<a href="https://www.instagram.com/someone/">profile</a></div>';
    expect(parseSavesFile("saved_posts.html", html)).toEqual([
      {
        url: "https://www.instagram.com/p/EEE/",
        kind: "post",
        collections: [],
      },
    ]);
  });

  it("returns nothing for files that are not saves", () => {
    expect(parseSavesFile("x.json", "not json")).toEqual([]);
    expect(parseSavesFile("x.json", '{"a": 3}')).toEqual([]);
  });
});

describe("mergeSaves and summarize", () => {
  const saves = mergeSaves([
    parseSavesFile("saved_posts.json", savedPosts),
    parseSavesFile("saved_collections.json", savedCollections),
  ]);

  it("dedupes by link, keeps collections and sorts newest first", () => {
    expect(saves.map((save) => save.url)).toEqual([
      "https://www.instagram.com/p/CCC/",
      "https://www.instagram.com/p/AAA/",
      "https://www.instagram.com/p/FFF/",
      "https://www.instagram.com/reel/BBB/",
    ]);
    expect(saves[1].collections).toEqual(["Recipes"]);
  });

  it("counts accounts, reels and the oldest save", () => {
    expect(summarize(saves)).toEqual({
      count: 4,
      accounts: 3,
      reels: 1,
      oldestAt: 1420070400 * 1000,
      topAccounts: [
        { author: "chef.anna", count: 2 },
        { author: "plants.daily", count: 1 },
        { author: "travel.jo", count: 1 },
      ],
      collections: [
        { name: "Lisbon trip", count: 1 },
        { name: "Recipes", count: 1 },
      ],
    });
  });

  it("filters by account, collection or @handle", () => {
    expect(saves.filter((s) => matchesQuery(s, "@chef")).length).toBe(2);
    expect(saves.filter((s) => matchesQuery(s, "lisbon")).length).toBe(1);
    expect(saves.filter((s) => matchesQuery(s, "  ")).length).toBe(4);
    expect(saves.filter((s) => matchesQuery(s, "p")).length).toBe(3);
  });
});

describe("toCsv", () => {
  it("writes one row per save and neutralises formulas", () => {
    const csv = toCsv([
      {
        url: "https://www.instagram.com/p/AAA/",
        kind: "post",
        author: "=cmd",
        savedAt: Date.UTC(2024, 0, 2),
        collections: ["Recipes", "Dinner, quick"],
      },
    ]);
    expect(csv).toBe(
      "account,type,saved_on,collections,link\r\n" +
        `'=cmd,post,2024-01-02,"Recipes; Dinner, quick",https://www.instagram.com/p/AAA/`,
    );
  });
});

describe("fixMojibake", () => {
  it("repairs Meta's Latin-1 escaped UTF-8 and leaves clean text alone", () => {
    expect(fixMojibake("cafÃ©")).toBe("café");
    expect(fixMojibake("café ☕")).toBe("café ☕");
    expect(fixMojibake("plain")).toBe("plain");
  });
});

function zip(files: { name: string; text: string; store?: boolean }[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const raw = Buffer.from(file.text);
    const data = file.store ? raw : deflateRawSync(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(file.store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(file.store ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, end]));
}

function source(bytes: Uint8Array): ZipSource {
  return {
    size: bytes.length,
    read: async (start, end) => bytes.slice(start, end),
  };
}

describe("savedFilesInZip", () => {
  it("pulls only the saved files out of a data download", async () => {
    const bytes = zip([
      { name: "media/posts/1.jpg", text: "binary", store: true },
      {
        name: "your_instagram_activity/saved/saved_posts.json",
        text: savedPosts,
      },
      {
        name: "your_instagram_activity/saved/saved_collections.json",
        text: savedCollections,
        store: true,
      },
    ]);
    expect(isZip(bytes)).toBe(true);
    const files = await savedFilesInZip(source(bytes));
    expect(files.map((file) => file.name)).toEqual([
      "your_instagram_activity/saved/saved_posts.json",
      "your_instagram_activity/saved/saved_collections.json",
    ]);
    expect(files[0].text).toBe(savedPosts);
    expect(files[1].text).toBe(savedCollections);
  });

  it("refuses a saved file that inflates past the size cap", async () => {
    const bomb = zip([
      {
        name: "saved/saved_posts.json",
        text: " ".repeat(51 * 1024 * 1024),
      },
    ]);
    await expect(savedFilesInZip(source(bomb))).rejects.toThrow(
      "entry_too_large",
    );
  });

  it("finds nothing in a zip without saves or in a non-zip", async () => {
    expect(
      await savedFilesInZip(source(zip([{ name: "a.txt", text: "hi" }]))),
    ).toEqual([]);
    expect(await savedFilesInZip(source(new Uint8Array(40)))).toEqual([]);
  });
});

describe("readSaves", () => {
  it("reads a zip and loose files, and explains what is missing", async () => {
    const zipFile = new File(
      [zip([{ name: "saved/saved_posts.json", text: savedPosts }]) as BlobPart],
      "instagram.zip",
    );
    const fromZip = await readSaves([zipFile]);
    expect(fromZip.ok && fromZip.saves.length).toBe(4);
    expect(fromZip.ok && fromZip.format).toBe("zip");
    expect(fromZip.ok && fromZip.fromHtml).toBe(false);

    const html = await readSaves([
      new File(
        ['<a href="https://www.instagram.com/p/EEE/">x</a>'],
        "saved_posts.html",
      ),
    ]);
    expect(html.ok && html.fromHtml).toBe(true);

    // Collections listed first: the saved_posts date still wins.
    const loose = await readSaves([
      new File([savedCollections], "saved_collections.json"),
      new File([savedPosts], "saved_posts.json"),
    ]);
    expect(loose.ok && loose.saves[1].collections).toEqual(["Recipes"]);
    expect(loose.ok && loose.saves[1].savedAt).toBe(1690000000 * 1000);

    const emptyZip = new File(
      [zip([{ name: "likes.json", text: "{}" }]) as BlobPart],
      "a.zip",
    );
    expect(await readSaves([emptyZip])).toEqual({
      ok: false,
      reason: "no_saved_files",
    });
    expect(await readSaves([new File(["{}"], "x.json")])).toEqual({
      ok: false,
      reason: "no_saves",
    });
  });
});

describe("readSaves without DecompressionStream", () => {
  it("asks for the loose file instead of calling a zip unreadable", async () => {
    vi.stubGlobal("DecompressionStream", undefined);
    try {
      const zipFile = new File(
        [
          zip([
            { name: "saved/saved_posts.json", text: savedPosts },
          ]) as BlobPart,
        ],
        "instagram.zip",
      );
      expect(await readSaves([zipFile])).toEqual({
        ok: false,
        reason: "old_browser",
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
