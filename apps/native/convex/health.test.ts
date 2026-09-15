// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { newConvexTest } from "./test.setup";

describe("GET /health", () => {
  it("answers 200 with an ok payload when the database read succeeds", async () => {
    const t = newConvexTest();
    const response = await t.fetch("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });
});
