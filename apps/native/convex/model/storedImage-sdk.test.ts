import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import { describe, expect, it, vi } from "vitest";

// A 24-byte ftyp box, as emitted by Apple's HEIC encoder.
const heic = Uint8Array.from([
  0, 0, 0, 24, 102, 116, 121, 112, 104, 101, 105, 99, 0, 0, 0, 0, 104, 101, 105,
  99, 109, 105, 102, 49,
]);

describe("stored image MIME type through the real AI SDK", () => {
  it("sends HEIC bytes to Google when the stored MIME type is supplied", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: { role: "model", parts: [{ text: "A photo" }] },
              finishReason: "STOP",
            },
          ],
        }),
        { headers: { "Content-Type": "application/json" } },
      ),
    );
    const google = createGoogleGenerativeAI({
      apiKey: "unit-test-only",
      fetch: request,
    });
    const model = google("gemini-3.1-flash-lite");
    const result = await generateText({
      model,
      maxRetries: 0,
      messages: [
        {
          role: "user",
          content: [{ type: "image", image: heic, mediaType: "image/heic" }],
        },
      ],
    });
    expect(result.text).toBe("A photo");
    expect(request).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(request.mock.calls[0][1]?.body));
    expect(body.contents[0].parts[0].inlineData).toEqual({
      mimeType: "image/heic",
      data: Buffer.from(heic).toString("base64"),
    });
  });
});
