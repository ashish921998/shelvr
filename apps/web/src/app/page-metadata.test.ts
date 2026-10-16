import { describe, expect, it } from "vitest";

import { metadata as rootMetadata } from "./layout";
import { metadata as homeMetadata } from "./page";
import { metadata as oracleMetadata } from "./oracle/page";
import { metadata as privacyMetadata } from "./privacy/page";
import { metadata as supportMetadata } from "./support/page";
import { metadata as termsMetadata } from "./terms/page";

// Next.js gives a page that defines no `alternates` or `openGraph` its
// parent's, so a canonical on the root layout would brand every page that
// only sets a title as the home page.
describe("page metadata", () => {
  it("keeps the canonical URL off the root layout", () => {
    expect(rootMetadata.alternates).toBeUndefined();
    expect(rootMetadata.openGraph).not.toHaveProperty("url");
    expect(rootMetadata.openGraph).toMatchObject({
      siteName: "Shelvr",
      type: "website",
    });
  });

  it.each([
    ["home", homeMetadata, "/"],
    ["privacy", privacyMetadata, "/privacy"],
    ["terms", termsMetadata, "/terms"],
    ["support", supportMetadata, "/support"],
    ["oracle", oracleMetadata, "/oracle"],
  ])("%s declares its own canonical and og:url", (_name, metadata, path) => {
    expect(metadata.alternates).toEqual({ canonical: path });
    expect(metadata.openGraph).toMatchObject({
      url: path,
      siteName: "Shelvr",
      type: "website",
    });
  });
});
