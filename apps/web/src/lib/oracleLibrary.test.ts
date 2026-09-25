import { describe, expect, it } from "vitest";

import { libraryStats, oracleRows, parseLibraryExport } from "./oracleLibrary";

const bookmarksHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1500000000">Recipes</H3>
    <DL><p>
        <DT><A HREF="https://www.seriouseats.com/cacio-e-pepe" ADD_DATE="1554940800" ICON="data:x">Cacio e Pepe &amp; Friends</A>
        <DT><A HREF="https://www.seriouseats.com/focaccia" ADD_DATE="1388620800">Focaccia</A>
        <DT><A HREF="https://github.com/trending" ADD_DATE="1600000000">Trending</A>
        <DT><A HREF="javascript:alert(1)">Bookmarklet</A>
    </DL><p>
</DL><p>`;

const instagramJson = JSON.stringify({
  saved_saved_media: [
    {
      title: "chef.anna",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/p/AAA/",
          timestamp: 1690000000,
        },
      },
    },
    {
      title: "travel.jo",
      string_map_data: {
        "Saved on": {
          href: "https://www.instagram.com/reel/BBB/",
          timestamp: 1420070400,
        },
      },
    },
    { title: "broken", string_map_data: {} },
  ],
});

const plainList = `https://news.ycombinator.com/item?id=1
not a url
https://www.nytimes.com/cooking/pie

https://news.ycombinator.com/item?id=2`;

describe("parseLibraryExport", () => {
  it("reads a Netscape bookmarks export", () => {
    const rows = parseLibraryExport(bookmarksHtml);
    const stats = libraryStats(rows);
    expect(stats.count).toBe(3);
    expect(stats.oldestAt).toBe(Date.UTC(2014, 0, 2));
    expect(stats.topDomains[0]).toBe("seriouseats.com");
    expect(rows[0].title).toBe("Cacio e Pepe & Friends");
  });

  it("reads an Instagram saved_posts.json export", () => {
    const rows = parseLibraryExport(instagramJson);
    const stats = libraryStats(rows);
    expect(stats.count).toBe(2);
    expect(stats.oldestAt).toBe(Date.UTC(2015, 0, 1));
    expect(stats.topDomains).toEqual(["instagram.com"]);
    expect(rows[0].title).toBe("chef.anna");
  });

  it("reads a plain list of URLs", () => {
    const rows = parseLibraryExport(plainList);
    const stats = libraryStats(rows);
    expect(stats.count).toBe(3);
    expect(stats.oldestAt).toBeUndefined();
    expect(stats.topDomains[0]).toBe("news.ycombinator.com");
  });

  it("returns nothing for a blob in no known format", () => {
    expect(parseLibraryExport("lol what is an export {]")).toEqual([]);
    expect(parseLibraryExport('{"saved_saved_media": 3}')).toEqual([]);
  });
});

describe("oracleRows", () => {
  it("samples at most 40 rows across the whole pile", () => {
    const rows = Array.from({ length: 400 }, (_, i) => ({
      url: `https://example.com/${i}`,
    }));
    const sample = oracleRows(rows);
    expect(sample).toHaveLength(40);
    expect(sample[0].label).toBe("https://example.com/0");
    expect(sample[39].label).toBe("https://example.com/390");
  });
});
