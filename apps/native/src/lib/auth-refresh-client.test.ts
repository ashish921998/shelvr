import { afterEach, expect, it, vi } from "vitest";
import { ConvexReactClient } from "convex/react";
import { AuthRefreshClient } from "./auth-refresh-client";

const disconnected = new Error(
  "fetch failed: The network connection was lost.",
);
const refresh = { forceRefreshToken: true };

function clientWithRefresh() {
  vi.useFakeTimers();
  const setAuth = vi
    .spyOn(ConvexReactClient.prototype, "setAuth")
    .mockImplementation(() => {});
  const client = new AuthRefreshClient("https://example.convex.cloud");
  const fetchToken = vi.fn<Parameters<typeof client.setAuth>[0]>();
  client.setAuth(fetchToken);
  return { client, fetchToken, run: setAuth.mock.calls[0]![0] };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it("keeps a refresh pending through connection losses and returns the recovered token", async () => {
  const { fetchToken, run } = clientWithRefresh();
  fetchToken
    .mockRejectedValueOnce(disconnected)
    .mockRejectedValueOnce(new Error("fetch failed: Unable to resolve host"))
    .mockResolvedValue("recovered");
  const pending = run(refresh);
  await vi.advanceTimersByTimeAsync(2999);
  expect(fetchToken).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);
  await expect(pending).resolves.toBe("recovered");
});

it("stops retrying when the session is replaced", async () => {
  const { client, fetchToken, run } = clientWithRefresh();
  fetchToken.mockRejectedValue(disconnected);
  const pending = run(refresh);
  await vi.advanceTimersByTimeAsync(5);
  client.setAuth(vi.fn());
  await vi.runAllTimersAsync();
  await expect(pending).resolves.toBeNull();
  expect(fetchToken).toHaveBeenCalledTimes(1);
});

it("preserves rejected credentials and an explicitly ended session", async () => {
  const { fetchToken, run } = clientWithRefresh();
  const invalid = new Error("invalid credentials");
  fetchToken.mockRejectedValueOnce(invalid).mockResolvedValueOnce(null);
  await expect(run(refresh)).rejects.toBe(invalid);
  await expect(run(refresh)).resolves.toBeNull();
});
