import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateObject: vi.fn(),
  serverLog: vi.fn(),
}));

vi.mock("ai", () => ({ generateObject: mocks.generateObject }));

vi.mock("@/lib/serverLog", () => ({
  serverLog: mocks.serverLog,
}));

import { POST } from "./route";

function image(bytes = 1024, type = "image/jpeg"): File {
  return new File([new Uint8Array(bytes)], "shot.jpg", { type });
}

function request(
  fields: { lens?: string; heat?: string; images?: File[] },
  headers: Record<string, string> = {},
): Request {
  const form = new FormData();
  if (fields.lens !== undefined) form.set("lens", fields.lens);
  if (fields.heat !== undefined) form.set("heat", fields.heat);
  for (const file of fields.images ?? []) form.append("images", file);
  return new Request("https://shelvr.test/api/reveal", {
    method: "POST",
    headers,
    body: form,
  });
}

const threeImages = () => [image(), image(), image()];

describe("POST /api/reveal", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "test-key");
    mocks.generateObject.mockReset();
    mocks.serverLog.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    ["an unknown lens", { lens: "horoscope", images: threeImages() }],
    ["zero images", { lens: "find", images: [] }],
    ["too few images", { lens: "era", images: [image(), image()] }],
    [
      "too many images",
      { lens: "find", images: [image(), image(), image(), image()] },
    ],
    [
      "a wrong mime type",
      { lens: "find", images: [image(1024, "application/pdf")] },
    ],
    ["an oversize file", { lens: "find", images: [image(1.6 * 1024 * 1024)] }],
    [
      "an oversize total",
      {
        lens: "era",
        images: [
          image(1.4 * 1024 * 1024),
          image(1.4 * 1024 * 1024),
          image(1.4 * 1024 * 1024),
        ],
      },
    ],
  ])("rejects %s with 400", async (_, fields) => {
    const result = await POST(request(fields));

    expect(result.status).toBe(400);
    await expect(result.json()).resolves.toEqual({
      message: expect.any(String),
    });
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it("returns 503 when the Gemini key is unset", async () => {
    vi.stubEnv("GOOGLE_GENERATIVE_AI_API_KEY", "");

    const result = await POST(request({ lens: "find", images: [image()] }));

    expect(result.status).toBe(503);
    expect(mocks.generateObject).not.toHaveBeenCalled();
  });

  it("sends the prompt and every image, and returns the reveal", async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        lines: ["One", "Two", "Three"],
        closer: "Kindly done.",
      },
    });
    const images = [image(10, "image/png"), image(20), image(30, "image/webp")];

    const result = await POST(
      request({ lens: "roast", heat: "spicy", images }),
    );

    expect(result.status).toBe(200);
    await expect(result.json()).resolves.toEqual({
      reveal: {
        lens: "roast",
        heat: "spicy",
        lines: ["One", "Two", "Three"],
        closer: "Kindly done.",
      },
    });
    const [call] = mocks.generateObject.mock.calls[0];
    const [message] = call.messages;
    expect(message.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("Heat: spicy"),
    });
    expect(
      message.content
        .slice(1)
        .map((part: { mediaType: string; data: Uint8Array }) => [
          part.mediaType,
          part.data.byteLength,
        ]),
    ).toEqual([
      ["image/png", 10],
      ["image/jpeg", 20],
      ["image/webp", 30],
    ]);
    expect(call.abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("drops heat from reveals that are not roasts", async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        matches: [
          {
            guess: "A lamp",
            kind: "product",
            confidence: "low",
            check: "Compare the shade.",
            searchQuery: "pleated lamp",
          },
        ],
      },
    });

    const result = await POST(
      request({ lens: "find", heat: "spicy", images: [image()] }),
    );

    expect(result.status).toBe(200);
    const { reveal } = await result.json();
    expect(reveal).not.toHaveProperty("heat");
    expect(reveal.lens).toBe("find");
  });

  it("returns 502 and logs a category when the model call fails", async () => {
    mocks.generateObject.mockRejectedValue(new TypeError("provider exploded"));

    const result = await POST(request({ lens: "find", images: [image()] }));

    expect(result.status).toBe(502);
    await expect(result.json()).resolves.toEqual({
      message: "We couldn't read those screenshots. Please try again.",
    });
    expect(mocks.serverLog).toHaveBeenCalledWith("error", "reveal_failed", {
      lens: "find",
      error_category: "TypeError",
    });
  });

  it("limits one IP to 10 reveals per window", async () => {
    mocks.generateObject.mockRejectedValue(new Error("fail fast"));
    const fromIp = () =>
      POST(
        request(
          { lens: "find", images: [image()] },
          { "x-forwarded-for": "198.51.100.7" },
        ),
      );

    for (let i = 0; i < 10; i++) expect((await fromIp()).status).toBe(502);
    expect((await fromIp()).status).toBe(429);
    expect(mocks.generateObject).toHaveBeenCalledTimes(10);
  });
});
