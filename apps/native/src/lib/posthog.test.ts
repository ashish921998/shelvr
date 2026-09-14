// Tests for the SDK boundary the app configures: the `before_send` hook must
// apply the same message allowlist to autocaptured `$exception` events that
// analytics.captureError applies to handled errors. The SDK itself is stubbed,
// so the real PostHog client never loads. Runs in the Node default env.
import { describe, expect, it, vi } from "vitest";

import { SAFE_ERROR_MESSAGES } from "./posthog";

type BeforeSend = (event: EventLike) => EventLike;
type ExceptionListEntry = {
  type?: unknown;
  value?: unknown;
  stacktrace?: unknown;
};
type EventLike = {
  event: string;
  properties?: Record<string, unknown>;
};

const posthogCtor = vi.hoisted(() => {
  // The module news up the client and registers environment properties on it
  // at import time, so the stub must be a constructible class exposing the
  // constructor options (where the send hook lives) and the touched surface.
  class PostHogStub {
    static options: unknown;
    register: unknown;
    getSessionId: unknown;
    constructor(_token: unknown, options: unknown) {
      PostHogStub.options = options;
      this.register = vi.fn();
      this.getSessionId = vi.fn(() => "session-1");
    }
  }
  return PostHogStub;
});
vi.mock("posthog-react-native", () => ({ default: posthogCtor }));
vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        posthogProjectToken: "phc_test",
        posthogHost: "https://test.i.posthog.com",
        variant: "development",
      },
    },
  },
}));

// The hook's key is the SDK's fixed snake_case option name.
function sentBeforeSend(): BeforeSend {
  const options = posthogCtor.options as Record<string, BeforeSend>;
  expect(options, "PostHog was constructed with options").toBeTruthy();
  return options["before_send"];
}

function exceptionEvent(overrides: {
  message?: unknown;
  type?: unknown;
  list?: unknown;
}): EventLike {
  const properties: Record<string, unknown> = {
    $exception_type: overrides.type ?? "Error",
  };
  if (overrides.message !== undefined) {
    properties.$exception_message = overrides.message;
  }
  if (overrides.list !== undefined) {
    properties.$exception_list = overrides.list;
  }
  return { event: "$exception", properties };
}

describe("posthog before_send", () => {
  it("keeps the allowlisted fixed message on autocaptured exceptions", () => {
    const beforeSend = sentBeforeSend();
    const sent = beforeSend(
      exceptionEvent({
        message: "Network request failed",
        list: [{ type: "Error", value: "Network request failed" }],
      }),
    );
    expect(sent.properties?.$exception_message).toBe("Network request failed");
    expect(sent.properties?.$exception_list).toEqual([
      { type: "Error", value: "Network request failed" },
    ]);
  });

  it("replaces content-carrying messages with the error class", () => {
    const beforeSend = sentBeforeSend();
    const noteUrl = "https://private.example/saved/note-42";
    const sent = beforeSend(
      exceptionEvent({
        message: `Unprocessable entity for ${noteUrl}`,
        type: "TypeError",
        list: [
          {
            type: "TypeError",
            value: `Unprocessable entity for ${noteUrl}`,
            stacktrace: "frame at app.js:1",
          },
        ],
      }),
    );
    const serialized = JSON.stringify(sent);
    expect(serialized).not.toContain(noteUrl);
    expect(sent.properties?.$exception_message).toBe("TypeError");
    const list = sent.properties?.$exception_list as ExceptionListEntry[];
    // The class identifies the exception for grouping; the stack still ships
    // for symbolication.
    expect(list[0].value).toBe("TypeError");
    expect(list[0].stacktrace).toBe("frame at app.js:1");
  });

  it("leaves non-exception events untouched", () => {
    const beforeSend = sentBeforeSend();
    const event: EventLike = {
      event: "item_opened",
      properties: { item_id: "items:1", message: "anything at all" },
    };
    expect(beforeSend(event)).toBe(event);
    // Value equality, not just identity: the hook must not stamp exception
    // keys (not even undefined ones) onto ordinary events.
    expect(event.properties).toEqual({
      item_id: "items:1",
      message: "anything at all",
    });
  });

  it("adds no keys to an exception event without a message or list", () => {
    const beforeSend = sentBeforeSend();
    const sent = beforeSend(exceptionEvent({ type: "RangeError" }));
    expect(Object.keys(sent.properties ?? {})).toEqual(["$exception_type"]);
  });

  it("tolerates a malformed exception list", () => {
    const beforeSend = sentBeforeSend();
    const sent = beforeSend(
      exceptionEvent({ message: "boom https://x.test", list: "not-a-list" }),
    );
    expect(sent.properties?.$exception_message).toBe("Error");
    expect(sent.properties?.$exception_list).toBe("not-a-list");
  });

  it("exports the shared allowlist used by analytics.captureError", () => {
    expect(SAFE_ERROR_MESSAGES.has("Network request failed")).toBe(true);
  });
});
