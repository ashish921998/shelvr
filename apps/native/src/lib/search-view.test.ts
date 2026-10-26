import { describe, expect, it } from "vitest";
import { searchView } from "./search-view";

const settled = { isPlaceholderData: false, isError: false };

describe("searchView", () => {
  it("invites a search before anything is typed", () => {
    expect(searchView("", { data: undefined, ...settled })).toMatchObject({
      kind: "message",
      title: "Find anything",
    });
  });

  it("keeps the last results up while the next query loads", () => {
    expect(
      searchView("pasta", {
        data: ["pas"],
        isPlaceholderData: true,
        isError: false,
      }),
    ).toEqual({ kind: "results", items: ["pas"] });
  });

  it("waits for the new query before saying nothing matches", () => {
    expect(
      searchView("pasta", {
        data: [],
        isPlaceholderData: true,
        isError: false,
      }),
    ).toEqual({ kind: "results", items: [] });
    expect(searchView("pasta", { data: [], ...settled })).toMatchObject({
      kind: "message",
      title: "Nothing yet",
      message: "No saves match “pasta”.",
    });
  });

  it("says the search failed instead of staying blank", () => {
    expect(
      searchView("pasta", {
        data: undefined,
        isPlaceholderData: false,
        isError: true,
      }),
    ).toMatchObject({ kind: "message", title: "Couldn't search" });
  });
});
