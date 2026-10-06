// @vitest-environment edge-runtime
/// <reference types="vite/client" />
import { expect, it } from "vitest";

import fixtures from "./model/appleJws.fixtures.json";
import { RETENTION_MAX_BODY_BYTES } from "./model/retentionMessaging";
import { newConvexTest } from "./test.setup";

const post = (body: BodyInit, headers?: HeadersInit) =>
  newConvexTest().fetch("/retention-messaging", {
    method: "POST",
    body,
    headers,
  });

it("refuses a body over the limit, declared or not", async () => {
  const oversized = "x".repeat(RETENTION_MAX_BODY_BYTES + 1);
  expect((await post(oversized)).status).toBe(400);
  const undeclared = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(oversized));
      controller.close();
    },
  });
  const response = await newConvexTest().fetch("/retention-messaging", {
    method: "POST",
    body: undeclared,
    duplex: "half",
  } as RequestInit);
  expect(response.status).toBe(400);
});

it("refuses a request whose chain does not end in Apple's root", async () => {
  const response = await post(
    JSON.stringify({ signedPayload: fixtures.valid }),
  );
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "bad_request" });
});
