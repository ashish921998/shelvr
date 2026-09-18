import { afterEach, describe, expect, it } from "vitest";
import { getTabSearchQuery, setTabSearchQuery } from "./tab-search-query";

afterEach(() => setTabSearchQuery(""));

describe("tab search query store", () => {
  it("starts empty and returns what the tab bar last wrote", () => {
    expect(getTabSearchQuery()).toBe("");
    setTabSearchQuery("ceramic mugs");
    expect(getTabSearchQuery()).toBe("ceramic mugs");
  });
});
