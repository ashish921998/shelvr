import { describe, expect, it } from "vitest";
import { appSchemeRoute, resolveRootHref } from "./home-href";

describe("resolveRootHref", () => {
  it("sends the root to Home and keeps its query", () => {
    expect(resolveRootHref("/")).toBe("/(app)/(tabs)/(home)");
    expect(resolveRootHref("/?a=1")).toBe("/(app)/(tabs)/(home)?a=1");
  });

  it("leaves other routes alone", () => {
    expect(resolveRootHref("/add")).toBe("/add");
    expect(resolveRootHref("/item/abc")).toBe("/item/abc");
  });

  it("sends retired screens to Home", () => {
    for (const path of [
      "/space/abc",
      "/digest/d1?from=push",
      "/(app)/(tabs)/(spaces)",
      "/(app)/(tabs)/(search)",
      "/new-space",
      "/manage-spaces?itemId=1",
      "/camera",
    ]) {
      expect(resolveRootHref(path)).toBe("/(app)/(tabs)/(home)");
    }
    expect(resolveRootHref("/spaceship")).toBe("/spaceship");
  });
});

describe("appSchemeRoute", () => {
  it("reads the route from both app-scheme spellings", () => {
    expect(appSchemeRoute("shelvr://space/abc")).toBe("/space/abc");
    expect(appSchemeRoute("shelvr-dev:///digest/d1?x=1")).toBe(
      "/digest/d1?x=1",
    );
    expect(appSchemeRoute("https://example.com/space/abc")).toBeNull();
  });
});
