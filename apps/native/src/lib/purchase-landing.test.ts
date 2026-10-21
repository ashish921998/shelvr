import { beforeEach, describe, expect, it } from "vitest";
import {
  endPurchaseLandingSession,
  readPurchaseLanding,
  reservePurchaseLanding,
  settlePurchaseLanding,
} from "./purchase-landing";

beforeEach(() => settlePurchaseLanding());

describe("purchase landing", () => {
  it("opens the wait when the store call finishes under the same account", () => {
    const landing = reservePurchaseLanding();
    landing();
    expect(readPurchaseLanding()).toBeGreaterThan(Date.now());
  });

  it("ignores a store call that finishes after sign-out", () => {
    const landing = reservePurchaseLanding();
    endPurchaseLandingSession();
    landing();
    expect(readPurchaseLanding()).toBe(0);
  });

  it("sign-out ends a wait already open", () => {
    reservePurchaseLanding()();
    endPurchaseLandingSession();
    expect(readPurchaseLanding()).toBe(0);
  });
});
