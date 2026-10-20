import { describe, expect, it } from "vitest";
import { resolveRootHref } from "./home-href";

describe("resolveRootHref", () => {
  it("sends the root to Home and keeps its query", () => {
    expect(resolveRootHref("/")).toBe("/(app)/(tabs)/(home)");
    expect(resolveRootHref("/?a=1")).toBe("/(app)/(tabs)/(home)?a=1");
  });

  it("leaves other routes alone", () => {
    expect(resolveRootHref("/add")).toBe("/add");
    expect(resolveRootHref("/item/abc")).toBe("/item/abc");
  });
});
