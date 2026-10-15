import { describe, expect, it } from "vitest";
import { BodyTooLargeError, readBoundedText } from "./requestBody";

describe("web bounded body reader", () => {
  it.each([undefined, "1"])(
    "enforces UTF-8 bytes despite size header %s",
    async (length) => {
      const request = new Request("https://example.com", {
        method: "POST",
        body: "ééé",
        headers: length ? { "content-length": length } : {},
      });
      await expect(readBoundedText(request, 5)).rejects.toBeInstanceOf(
        BodyTooLargeError,
      );
    },
  );
  it("cancels the remainder of an oversized stream", async () => {
    let canceled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(8));
      },
      cancel() {
        canceled = true;
      },
    });
    const request = new Request("https://example.com", {
      method: "POST",
      body,
      duplex: "half",
    } as RequestInit);
    await expect(readBoundedText(request, 10)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    );
    expect(canceled).toBe(true);
  });
  it("accepts the byte boundary and refuses unsupported encoding", async () => {
    await expect(
      readBoundedText(
        new Request("https://example.com", { method: "POST", body: "é" }),
        2,
      ),
    ).resolves.toBe("é");
    await expect(
      readBoundedText(
        new Request("https://example.com", {
          method: "POST",
          body: "data",
          headers: { "content-encoding": "gzip" },
        }),
        100,
      ),
    ).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});
