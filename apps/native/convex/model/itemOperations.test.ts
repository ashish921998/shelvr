import { describe, expect, expectTypeOf, it } from "vitest";
import type { Id } from "../_generated/dataModel";
import {
  loadItemOperation,
  parseOperationId,
  type OperationId,
} from "./itemOperations";

describe("parseOperationId", () => {
  it("brands an operation ID only after validating its length", () => {
    expect(parseOperationId("operation-123")).toBe("operation-123");
    expect(() => parseOperationId("short")).toThrow(
      "Operation ID validation failed: expected 8-200 characters",
    );
  });

  it("keeps user and operation IDs as distinct parameter types", () => {
    expectTypeOf<Parameters<typeof loadItemOperation>[1]>().toEqualTypeOf<
      Id<"users">
    >();
    expectTypeOf<
      Parameters<typeof loadItemOperation>[2]
    >().toEqualTypeOf<OperationId>();
  });
});
