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
      "/trip/abc?city=Lisbon",
    ]) {
      expect(resolveRootHref(path)).toBe("/(app)/(tabs)/(home)");
    }
    expect(resolveRootHref("/spaceship")).toBe("/spaceship");
    expect(resolveRootHref("/trip-plan/abc")).toBe("/trip-plan/abc");
    expect(resolveRootHref("/(trips)")).toBe("/(trips)");
  });

  it("opens the Map tab for its links, keeping the query", () => {
    for (const path of ["/map", "/map/", "/(map)", "/(app)/(tabs)/(map)"]) {
      expect(resolveRootHref(path)).toBe("/(app)/(tabs)/(map)");
    }
    expect(resolveRootHref("/map?from=push")).toBe(
      "/(app)/(tabs)/(map)?from=push",
    );
    expect(resolveRootHref("/maple")).toBe("/maple");
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
