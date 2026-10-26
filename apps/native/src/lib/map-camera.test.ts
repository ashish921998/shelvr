import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { moveCamera, sameCamera } from "./map-camera";

const at = (latitude: number, zoom = 12) => ({
  coordinates: { latitude, longitude: -97.75 },
  zoom,
});

describe("sameCamera", () => {
  it("compares cameras by value", () => {
    expect(sameCamera(at(30.25), at(30.25))).toBe(true);
    expect(sameCamera(at(30.25), at(30.26))).toBe(false);
    expect(sameCamera(at(30.25), at(30.25, 13))).toBe(false);
    expect(sameCamera(undefined, at(30.25))).toBe(false);
    expect(sameCamera(undefined, undefined)).toBe(true);
  });
});

describe("moveCamera", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const notFound = new Error("Unable to find the 'AppleMapsView' view");

  it("retries while the map view is still registering, without reporting", async () => {
    const move = vi
      .fn()
      .mockRejectedValueOnce(notFound)
      .mockResolvedValueOnce(undefined);
    const onFail = vi.fn();
    moveCamera(move, onFail);
    await vi.runAllTimersAsync();
    expect(move).toHaveBeenCalledTimes(2);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("reports the error once every attempt has failed", async () => {
    const move = vi.fn().mockRejectedValue(notFound);
    const onFail = vi.fn();
    moveCamera(move, onFail);
    await vi.runAllTimersAsync();
    expect(move).toHaveBeenCalledTimes(4);
    expect(onFail).toHaveBeenCalledExactlyOnceWith(notFound);
  });

  it("stops retrying once cancelled", async () => {
    const move = vi.fn().mockRejectedValue(notFound);
    const onFail = vi.fn();
    const cancel = moveCamera(move, onFail);
    await vi.advanceTimersByTimeAsync(0);
    cancel();
    await vi.runAllTimersAsync();
    expect(move).toHaveBeenCalledTimes(1);
    expect(onFail).not.toHaveBeenCalled();
  });

  it("does nothing while there is no map to move", async () => {
    const onFail = vi.fn();
    moveCamera(() => undefined, onFail);
    await vi.runAllTimersAsync();
    expect(onFail).not.toHaveBeenCalled();
  });
});
