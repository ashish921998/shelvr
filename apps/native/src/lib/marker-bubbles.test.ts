import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bubbleKey,
  bubbleSignature,
  loadWithRetry,
  parseBubbleKey,
  signatureKeys,
} from "./marker-bubbles";

describe("marker bubbles", () => {
  it("keeps one key per emoji and selected pair, whatever the pin order", () => {
    const signature = bubbleSignature([
      { emoji: "☕", selected: false },
      { emoji: "🍽️", selected: false },
      { emoji: "☕", selected: false },
      { emoji: "☕", selected: true },
    ]);
    expect(signatureKeys(signature)).toHaveLength(3);
    expect(
      bubbleSignature([
        { emoji: "☕", selected: true },
        { emoji: "🍽️", selected: false },
        { emoji: "☕", selected: false },
      ]),
    ).toBe(signature);
  });

  it("reads a key back into its emoji and selected state", () => {
    for (const request of [
      { emoji: "🍽️", selected: true },
      { emoji: "👨‍👩‍👧", selected: false },
    ]) {
      expect(parseBubbleKey(bubbleKey(request))).toEqual(request);
    }
  });

  it("has no keys when there are no pins", () => {
    expect(signatureKeys(bubbleSignature([]))).toEqual([]);
  });
});

describe("loadWithRetry", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries a failed load and delivers a later success", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn<() => Promise<string | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValue("bubble");
    const onLoad = vi.fn();
    loadWithRetry(load, onLoad, [10, 20, 30]);
    await vi.advanceTimersByTimeAsync(30);
    expect(load).toHaveBeenCalledTimes(3);
    expect(onLoad).toHaveBeenCalledExactlyOnceWith("bubble");
  });

  it("stops after the last delay", async () => {
    vi.useFakeTimers();
    const load = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);
    const onLoad = vi.fn();
    loadWithRetry(load, onLoad, [10, 20]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(3);
    expect(onLoad).not.toHaveBeenCalled();
  });

  it("delivers nothing and retries no more once cancelled", async () => {
    vi.useFakeTimers();
    let finish: (value: string | null) => void = () => {};
    const load = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          finish = resolve;
        }),
    );
    const onLoad = vi.fn();
    const cancel = loadWithRetry(load, onLoad, [10]);
    cancel();
    finish("bubble");
    await vi.advanceTimersByTimeAsync(1000);
    expect(onLoad).not.toHaveBeenCalled();
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("cancels a scheduled retry", async () => {
    vi.useFakeTimers();
    const load = vi.fn<() => Promise<string | null>>().mockResolvedValue(null);
    const cancel = loadWithRetry(load, vi.fn(), [10]);
    await vi.advanceTimersByTimeAsync(0);
    cancel();
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
