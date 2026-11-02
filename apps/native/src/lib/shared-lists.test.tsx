// @vitest-environment jsdom
import { cityPinId } from "@/lib/city-pins";
import { stopAction } from "@/lib/trip-planner";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import {
  inviteUrl,
  listRows,
  listSectionRows,
  nextAlsoAddState,
  savedByLine,
  type SharedListPlace,
  useAlsoAddTo,
  useNameGate,
  useTypedCity,
  withLine,
} from "./shared-lists";

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  remove: vi.fn(),
  capture: vi.fn(),
  captureError: vi.fn(),
  query: vi.fn((): { data?: unknown } => ({})),
}));
vi.mock("convex/react", () => ({
  useConvexAuth: () => ({ isAuthenticated: true }),
  useMutation: (ref: { name: string }) =>
    ref.name === "add" ? mocks.add : mocks.remove,
}));
vi.mock("@convex/_generated/api", () => ({
  api: {
    sharedLists: {
      listSharedLists: { name: "list" },
      addSavePlaces: { name: "add" },
      removeSavePlaces: { name: "remove" },
    },
    users: { getMyFirstName: { name: "firstName" } },
  },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mocks.capture, captureError: mocks.captureError },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/share-link", () => ({ shareUrl: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => mocks.query() }));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  Share: { share: vi.fn(), sharedAction: "sharedAction" },
}));

afterEach(() => {
  vi.restoreAllMocks();
  mocks.add.mockReset();
  mocks.remove.mockReset();
  mocks.capture.mockReset();
  mocks.captureError.mockReset();
});

const ITEM = "item1" as Id<"items">;
const LIST = "list1" as Id<"sharedLists">;

function place(over: Partial<SharedListPlace> = {}): SharedListPlace {
  return {
    _id: `p-${over.name ?? "x"}` as Id<"sharedListPlaces">,
    name: "Place",
    lat: 38.7,
    lng: -9.1,
    city: "Lisbon",
    addedByYou: false,
    addedAt: 1,
    isNew: false,
    ...over,
  };
}

describe("stopAction on a list place", () => {
  it("opens the save only when the row has your save", () => {
    expect(stopAction(place({ itemId: ITEM, appleId: "a" }), true)).toEqual({
      kind: "save",
      itemId: ITEM,
    });
  });

  it("opens Apple's place card for a partner's place with an Apple id", () => {
    expect(stopAction(place({ appleId: "a" }), true)).toEqual({
      kind: "card",
      appleId: "a",
    });
  });

  it("falls back to Maps by coordinates, never a dead save page", () => {
    const action = stopAction(place({ appleId: "a" }), false);
    expect(action.kind).toBe("maps");
    expect(stopAction(place(), true).kind).toBe("maps");
  });
});

describe("listRows", () => {
  it("puts new places first and numbers rows and pins together", () => {
    const rows = listRows(
      [
        place({ name: "Old" }),
        place({ name: "New", isNew: true }),
        place({ name: "Porto", city: "Porto" }),
      ],
      "Lisbon",
    );
    expect(rows.map((row) => [row.place.name, row.pin.number])).toEqual([
      ["New", 1],
      ["Old", 2],
    ]);
  });
});

describe("listSectionRows", () => {
  it("gives a place row its pin's id, so map and list select each other", () => {
    const rows = listRows(
      [place({ name: "Old" }), place({ name: "New", isNew: true })],
      "Lisbon",
    );
    const places = listSectionRows(rows, "Maya").filter(
      (row) => row.kind === "place",
    );
    expect(places.map((row) => row.id)).toEqual(
      rows.map((row) => cityPinId(row.pin)),
    );
  });

  it("heads the sections only when something is new", () => {
    const old = listRows([place({ name: "Old" })], "Lisbon");
    expect(listSectionRows(old, "Maya").map((row) => row.kind)).toEqual([
      "place",
    ]);
    const both = listRows(
      [place({ name: "Old" }), place({ name: "New", isNew: true })],
      "Lisbon",
    );
    expect(listSectionRows(both, "Maya").map((row) => row.kind)).toEqual([
      "heading",
      "place",
      "heading",
      "place",
    ]);
  });
});

describe("savedByLine", () => {
  it("says someone left only when the server says so, not for a missing name", () => {
    expect(savedByLine(place({ addedByName: "Maya" }))).toBe(
      'sharedLists.savedBy:{"name":"Maya"}',
    );
    expect(savedByLine(place())).toBe("sharedLists.someoneSaved");
    expect(savedByLine(place({ addedByPastMember: true }))).toBe(
      "sharedLists.pastMemberSaved",
    );
    expect(savedByLine(place({ addedByYou: true }))).toBe(
      "sharedLists.youSaved",
    );
  });
});

describe("withLine and inviteUrl", () => {
  it("names the others, or says it is only you", () => {
    expect(
      withLine([
        { isYou: true, firstName: "Ashish" },
        { isYou: false, firstName: "Maya" },
      ]),
    ).toBe('sharedLists.with:{"names":"Maya"}');
    expect(withLine([{ isYou: true }])).toBe("sharedLists.onlyYou");
  });

  it("builds the invite link on the web origin", () => {
    expect(inviteUrl("ab cd")).toBe("https://shelvr-web.vercel.app/l/ab%20cd");
  });
});

describe("useAlsoAddTo", () => {
  it("is off by default, adds on the first tap and removes on the second", async () => {
    mocks.add.mockResolvedValue(3);
    mocks.remove.mockResolvedValue(3);
    const { result } = renderHook(() => useAlsoAddTo(ITEM, "Lisbon"));
    expect(nextAlsoAddState(result.current.state[LIST])).toBe("add");

    await act(() => result.current.toggle(LIST));
    expect(mocks.add).toHaveBeenCalledWith({
      listId: LIST,
      itemId: ITEM,
      city: "Lisbon",
    });
    await waitFor(() => expect(result.current.state[LIST]).toBe("on"));
    expect(mocks.capture).toHaveBeenCalledWith("shared_list_place_added", {
      from: "spots",
    });

    await act(() => result.current.toggle(LIST));
    expect(mocks.remove).toHaveBeenCalledWith({ listId: LIST, itemId: ITEM });
    await waitFor(() => expect(result.current.state[LIST]).toBe("off"));
  });

  it("goes back to off when adding fails, and reports it", async () => {
    mocks.add.mockRejectedValue(new Error("offline"));
    const { result } = renderHook(() => useAlsoAddTo(ITEM, "Lisbon"));
    await act(() => result.current.toggle(LIST));
    await waitFor(() => expect(result.current.state[LIST]).toBe("off"));
    expect(mocks.captureError).toHaveBeenCalled();
  });

  it("ignores a tap while a call is running", () => {
    expect(nextAlsoAddState("adding")).toBeNull();
    expect(nextAlsoAddState("removing")).toBeNull();
  });
});

describe("useTypedCity", () => {
  it("adds the whole city once when return and blur land with the last letter", () => {
    const add = vi.fn();
    const { result } = renderHook(() => useTypedCity(add));
    act(() => result.current.change("Lisbo"));
    act(() => {
      result.current.change("Lisbon");
      result.current.commit();
      result.current.commit();
    });
    expect(add.mock.calls).toEqual([["Lisbon"]]);
    expect(result.current.typed).toBe("");
  });

  it("tidies spaces and ignores a blank field", () => {
    const add = vi.fn();
    const { result } = renderHook(() => useTypedCity(add));
    act(() => {
      result.current.change("   ");
      result.current.commit();
      result.current.change("  New   York ");
      result.current.commit();
    });
    expect(add.mock.calls).toEqual([["New York"]]);
  });
});

describe("useNameGate", () => {
  it("goes straight on for someone with a name", () => {
    mocks.query.mockReturnValue({ data: "Maya" });
    const action = vi.fn();
    const { result } = renderHook(() => useNameGate());
    act(() => result.current.gate(action));
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(false);
  });

  it("asks a nameless person once, then carries on whatever they chose", () => {
    mocks.query.mockReturnValue({ data: null });
    const action = vi.fn();
    const { result } = renderHook(() => useNameGate());
    act(() => result.current.gate(action));
    expect(result.current.asking).toBe(true);
    expect(action).not.toHaveBeenCalled();

    act(() => result.current.finish());
    expect(action).toHaveBeenCalledTimes(1);
    expect(result.current.asking).toBe(false);

    act(() => result.current.gate(action));
    expect(action).toHaveBeenCalledTimes(2);
    expect(result.current.asking).toBe(false);
  });
});
