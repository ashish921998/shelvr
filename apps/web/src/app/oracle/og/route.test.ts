import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { encodeSharedVerdict } from "@/lib/oracleShare";
import { signVerdict } from "@/lib/oracleProof";

const { budget } = vi.hoisted(() => ({ budget: vi.fn() }));
vi.mock("@/lib/requestBody", () => ({ authorizeRequestBody: budget }));
afterEach(() => {
  vi.unstubAllEnvs();
  budget.mockReset();
});

it("rejects invalid and unsigned cards before invoking the rendering budget", async () => {
  vi.stubEnv("WAITLIST_SHARED_SECRET", "test-secret");
  const unsigned = encodeSharedVerdict({
    mode: "links",
    persona: "Forged",
    tagline: "Not generated",
    spaces: [],
  });
  for (const query of [
    `?c=${unsigned}`,
    "",
    "?c=not-signed",
    "?c=not-signed&extra=cache-buster",
  ]) {
    const response = await GET(
      new Request(`https://example.com/oracle/og${query}`),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
  }
  expect(budget).not.toHaveBeenCalled();
});

it("does not render signed cards after the shared budget refuses them", async () => {
  vi.stubEnv("WAITLIST_SHARED_SECRET", "test-secret");
  const code = await signVerdict({
    mode: "links",
    persona: "Collector",
    tagline: "A shelf",
    spaces: [],
  });
  budget.mockResolvedValue(new Response(null, { status: 429 }));
  const response = await GET(
    new Request(`https://example.com/oracle/og?c=${code}`),
  );
  expect(response.status).toBe(429);
  expect(budget).toHaveBeenCalledWith(expect.any(Request), "oracle-image");
});
