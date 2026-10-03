import { afterEach, describe, expect, it, vi } from "vitest";
import { signVerdict, verifiedVerdict } from "./oracleProof";
import { encodeSharedVerdict } from "./oracleShare";

const verdict = {
  mode: "links" as const,
  persona: "Collector",
  tagline: "A shelf of ideas",
  spaces: [],
};
afterEach(() => vi.unstubAllEnvs());
describe("Oracle proof", () => {
  it("accepts only a server-signed verdict", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", "test-secret");
    const signed = await signVerdict(verdict);
    expect(await verifiedVerdict(signed)).toEqual(verdict);
    expect(await verifiedVerdict(encodeSharedVerdict(verdict))).toBeUndefined();
    const forged = `${encodeSharedVerdict({ ...verdict, persona: "Forged" })}.${signed.split(".")[1]}`;
    expect(await verifiedVerdict(forged)).toBeUndefined();
  });
  it("fails closed without the server key or with a different key", async () => {
    vi.stubEnv("WAITLIST_SHARED_SECRET", "test-secret");
    const signed = await signVerdict(verdict);
    vi.stubEnv("WAITLIST_SHARED_SECRET", "other-secret");
    expect(await verifiedVerdict(signed)).toBeUndefined();
    vi.stubEnv("WAITLIST_SHARED_SECRET", "");
    expect(await verifiedVerdict(signed)).toBeUndefined();
    await expect(signVerdict(verdict)).rejects.toThrow();
  });
});
