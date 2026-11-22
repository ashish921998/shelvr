import { describe, expect, it } from "vitest";
import { tripSharePage } from "./tripSharePage";

describe("tripSharePage", () => {
  it("escapes quotes and markup in names and notes", async () => {
    const html = await tripSharePage({
      name: `Ana's "best" <trip>`,
      city: "Lisbon",
      days: [[{ name: `Café "A"`, lat: 38.7, lng: -9.1, note: "<b>x</b>'" }]],
    }).text();
    expect(html).toContain("Ana&#39;s &quot;best&quot; &lt;trip&gt;");
    expect(html).toContain("Café &quot;A&quot;</a>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;&#39;");
    expect(html).not.toContain(`"best"`);
  });

  it("answers 404 without a trip", () => {
    expect(tripSharePage(null).status).toBe(404);
  });
});
