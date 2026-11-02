import { saveError } from "@convex/model/saveErrors";
import type { AppIntentInvocation } from "expo-app-intents";
import { describe, expect, it, vi } from "vitest";
import { drainInvocations } from "./app-intent-invocations";

function invocation(name: string, id = name): AppIntentInvocation {
  return { id, name, params: {}, createdAt: 0 };
}

function deps(entitled: boolean, failWith?: unknown) {
  return {
    entitled,
    inFlight: new Set<string>(),
    handle: vi.fn(async () => {
      if (failWith !== undefined) throw failWith;
    }),
    remove: vi.fn(async () => {}),
    report: vi.fn(),
  };
}

describe("drainInvocations", () => {
  it("keeps a save the account had no Pro for, without reporting it", async () => {
    const d = deps(true, saveError("pro_required"));
    await drainInvocations([invocation("saveLink")], d);
    expect(d.handle).toHaveBeenCalledTimes(1);
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.report).not.toHaveBeenCalled();
  });

  it("drops a save the server refused for another reason", async () => {
    const d = deps(true, saveError("photo_limit"));
    await drainInvocations([invocation("saveImages")], d);
    expect(d.remove).toHaveBeenCalledWith("saveImages");
  });

  it("keeps and reports a save that failed for an unknown reason", async () => {
    const d = deps(true, new Error("offline"));
    await drainInvocations([invocation("saveNote")], d);
    expect(d.remove).not.toHaveBeenCalled();
    expect(d.report).toHaveBeenCalledTimes(1);
  });

  it("leaves saves queued until the account has Pro, but still opens screens", async () => {
    const d = deps(false);
    await drainInvocations([invocation("saveLink"), invocation("openItem")], d);
    expect(d.handle).toHaveBeenCalledTimes(1);
    expect(d.handle).toHaveBeenCalledWith(invocation("openItem"));
    expect(d.remove).toHaveBeenCalledWith("openItem");
    expect(d.remove).not.toHaveBeenCalledWith("saveLink");
  });

  it("saves and removes a queued save once the account has Pro", async () => {
    const d = deps(true);
    await drainInvocations([invocation("saveLink")], d);
    expect(d.handle).toHaveBeenCalledTimes(1);
    expect(d.remove).toHaveBeenCalledWith("saveLink");
  });

  it("skips an invocation already being handled", async () => {
    const d = deps(true);
    d.inFlight.add("saveLink");
    await drainInvocations([invocation("saveLink")], d);
    expect(d.handle).not.toHaveBeenCalled();
  });
});
