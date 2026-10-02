import { describe, expect, it } from "vitest";
import { xConnectOutcome } from "./x-import";

describe("xConnectOutcome", () => {
  it("reads a successful connect from the return URL", () => {
    expect(
      xConnectOutcome({ type: "success", url: "shelvr://import?x=connected" }),
    ).toBe("connected");
  });

  it("treats a failed or unrecognized return as a failure", () => {
    expect(
      xConnectOutcome({ type: "success", url: "shelvr://import?x=failed" }),
    ).toBe("failed");
    expect(xConnectOutcome({ type: "success", url: "shelvr://import" })).toBe(
      "failed",
    );
    expect(xConnectOutcome({ type: "success", url: "not a url" })).toBe(
      "failed",
    );
  });

  it("treats a closed browser as a cancel", () => {
    expect(xConnectOutcome({ type: "cancel" })).toBe("cancelled");
    expect(xConnectOutcome({ type: "dismiss" })).toBe("cancelled");
    expect(xConnectOutcome(null)).toBe("cancelled");
  });
});
