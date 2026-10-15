import { describe, expect, it, vi } from "vitest";
import { createSheetRequestStore } from "./sheet-request-store";

describe("createSheetRequestStore", () => {
  it("shows a request until it is resolved", async () => {
    const store = createSheetRequestStore<string, number>(-1);
    expect(store.current()).toBeNull();
    const result = store.request("primer");
    expect(store.current()).toBe("primer");
    store.resolve(7);
    expect(await result).toBe(7);
    expect(store.current()).toBeNull();
  });

  it("resolves a pending request with the superseded result when a new one opens", async () => {
    const store = createSheetRequestStore<string, number>(-1);
    const first = store.request("first");
    const second = store.request("second");
    expect(await first).toBe(-1);
    expect(store.current()).toBe("second");
    store.resolve(2);
    expect(await second).toBe(2);
  });

  it("ignores a resolve with nothing open", async () => {
    const store = createSheetRequestStore<string, number>(-1);
    const listener = vi.fn();
    store.subscribe(listener);
    store.resolve(1);
    expect(listener).not.toHaveBeenCalled();
    const result = store.request("next");
    store.resolve(3);
    store.resolve(4);
    expect(await result).toBe(3);
  });

  it("tells subscribers about every open and close until they leave", () => {
    const store = createSheetRequestStore<string, number>(-1);
    const seen: (string | null)[] = [];
    const leave = store.subscribe(() => seen.push(store.current()));
    void store.request("a");
    void store.request("b");
    store.resolve(0);
    leave();
    void store.request("c");
    expect(seen).toEqual(["a", null, "b", null]);
  });

  it("closes the sheet before the caller sees the result", async () => {
    const store = createSheetRequestStore<string, number>(-1);
    const result = store.request("a").then(() => store.current());
    store.resolve(1);
    expect(await result).toBeNull();
  });
});
