import { describe, expect, it } from "vitest";
import {
  deferLink,
  releaseSheetLink,
  rememberSheetLink,
  sheetRouteOf,
} from "./deferred-sheet-link";

describe("deferred sheet link", () => {
  it("reads sheet routes from scheme, triple-slash and relative links", () => {
    expect(sheetRouteOf("shelvr://add?mode=note")).toBe("/add?mode=note");
    expect(sheetRouteOf("shelvr-dev:///add")).toBe("/add");
    expect(sheetRouteOf("/add")).toBe("/add");
    expect(sheetRouteOf("/camera")).toBeNull();
    expect(sheetRouteOf("shelvr://item/abc")).toBeNull();
    expect(sheetRouteOf("not a url")).toBeNull();
  });

  it("keeps a sheet link that arrives before the plan, once", () => {
    rememberSheetLink("shelvr://add");
    expect(releaseSheetLink(true)).toBeNull();
    expect(releaseSheetLink(false)).toEqual({
      route: "/add",
      sheet: true,
    });
    expect(releaseSheetLink(false)).toBeNull();
  });

  it("discards a queued sheet when a newer content link arrives", () => {
    releaseSheetLink(true);
    rememberSheetLink("shelvr://add");
    rememberSheetLink("shelvr://item/abc");
    expect(releaseSheetLink(false)).toBeNull();
  });

  it("ignores a link once the plan is known, since it routes normally", () => {
    releaseSheetLink(false);
    rememberSheetLink("shelvr://add");
    expect(releaseSheetLink(false)).toBeNull();
  });

  it("keeps only the newest of a tap and a deep link", () => {
    releaseSheetLink(true);
    expect(deferLink("/item/a")).toBe(true);
    rememberSheetLink("shelvr://add");
    expect(releaseSheetLink(false)).toEqual({ route: "/add", sheet: true });
    expect(deferLink("/item/a")).toBe(false);
  });
});
