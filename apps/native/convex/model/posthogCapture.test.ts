import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deliverPostHogEvent,
  newDeliveryId,
  scheduleCaptureRetry,
} from "./posthogCapture";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function ok() {
  return vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    event: "unit_event",
    distinctId: "user-1",
    deliveryId: "delivery-1",
    properties: { analytics_version: 1 },
    ...overrides,
  };
}

describe("deliverPostHogEvent", () => {
  it("sends nothing when the deployment has no project token", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "");
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    expect(await deliverPostHogEvent(request())).toEqual({
      status: "unconfigured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts one capture envelope to the configured host with a deadline", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("POSTHOG_HOST", "https://analytics.example/");
    vi.stubEnv("OBSERVABILITY_ENV", "production");
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    expect(await deliverPostHogEvent(request({ timestamp: 1000 }))).toEqual({
      status: "delivered",
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://analytics.example/capture/");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      api_key: "phc_test",
      event: "unit_event",
      uuid: "delivery-1",
      timestamp: "1970-01-01T00:00:01.000Z",
      properties: {
        distinct_id: "user-1",
        environment: "production",
        analytics_version: 1,
      },
    });
  });

  it("labels every non-production deployment development and lets a caller override it", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubEnv("OBSERVABILITY_ENV", "preview");
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    await deliverPostHogEvent(request());
    await deliverPostHogEvent(
      request({ properties: { environment: "sandbox" } }),
    );
    const environments = fetchMock.mock.calls.map(
      (call) => JSON.parse(call[1].body).properties.environment,
    );
    expect(environments).toEqual(["development", "sandbox"]);
  });

  it("omits the timestamp when the caller has none", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    const fetchMock = ok();
    vi.stubGlobal("fetch", fetchMock);
    await deliverPostHogEvent(request());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty(
      "timestamp",
    );
  });

  it.each([400, 401, 403, 422])(
    "treats HTTP %s as permanently rejected",
    async (status) => {
      vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status })),
      );
      expect(await deliverPostHogEvent(request())).toEqual({
        status: "rejected",
        httpStatus: status,
      });
    },
  );

  it.each([429, 500, 503])("treats HTTP %s as retryable", async (status) => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status })),
    );
    expect(await deliverPostHogEvent(request())).toEqual({
      status: "retryable",
      httpStatus: status,
    });
  });

  it("treats a transport failure as retryable and carries the cause", async () => {
    vi.stubEnv("POSTHOG_PROJECT_TOKEN", "phc_test");
    const error = new Error("socket closed");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(error));
    expect(await deliverPostHogEvent(request())).toEqual({
      status: "retryable",
      error,
    });
  });
});

describe("newDeliveryId", () => {
  it("mints a distinct dedupe id per event", () => {
    const first = newDeliveryId();
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(newDeliveryId()).not.toBe(first);
  });
});

describe("scheduleCaptureRetry", () => {
  it("backs off by a factor of ten and counts the attempt up", async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(await scheduleCaptureRetry(attempt, 3, schedule)).toBe(true);
    }
    expect(schedule.mock.calls).toEqual([
      [1000, 1],
      [10000, 2],
      [100000, 3],
    ]);
  });

  it("stops once the attempt budget is spent", async () => {
    const schedule = vi.fn().mockResolvedValue(undefined);
    expect(await scheduleCaptureRetry(3, 3, schedule)).toBe(false);
    expect(await scheduleCaptureRetry(4, 3, schedule)).toBe(false);
    expect(schedule).not.toHaveBeenCalled();
  });

  it("reports the event lost rather than throwing when the scheduler refuses", async () => {
    // The first attempt runs inline with a classification or a save; a
    // scheduler outage must surface as a logged loss, never as that work
    // failing after it already committed.
    const schedule = vi
      .fn()
      .mockRejectedValue(new Error("scheduler unavailable"));
    await expect(scheduleCaptureRetry(0, 3, schedule)).resolves.toBe(false);
    expect(schedule).toHaveBeenCalledWith(1000, 1);
  });
});
