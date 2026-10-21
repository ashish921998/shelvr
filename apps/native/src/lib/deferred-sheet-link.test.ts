import { describe, expect, it } from "vitest";
import {
  releaseSheetLink,
  rememberSheetLink,
  sheetRouteOf,
} from "./deferred-sheet-link";

describe("deferred sheet link", () => {
  it("reads sheet routes from scheme, triple-slash and relative links", () => {
    expect(sheetRouteOf("shelvr://add?mode=note")).toBe("/add?mode=note");
    expect(sheetRouteOf("shelvr-dev:///camera")).toBe("/camera");
    expect(sheetRouteOf("/manage-spaces")).toBe("/manage-spaces");
    expect(sheetRouteOf("shelvr://item/abc")).toBeNull();
    expect(sheetRouteOf("not a url")).toBeNull();
  });

  it("keeps a sheet link that arrives before the plan, once", () => {
    rememberSheetLink("shelvr://new-space");
    expect(releaseSheetLink(true)).toBeNull();
    expect(releaseSheetLink(false)).toBe("/new-space");
    expect(releaseSheetLink(false)).toBeNull();
  });

  it("ignores a link once the plan is known, since it routes normally", () => {
    releaseSheetLink(false);
    rememberSheetLink("shelvr://add");
    expect(releaseSheetLink(false)).toBeNull();
  });
});
