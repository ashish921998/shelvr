// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FallbackOnError } from "./fallback-on-error";

const mock = vi.hoisted(() => ({ captureError: vi.fn() }));

vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));

function Throws(): never {
  throw new Error("Could not find public function");
}

describe("FallbackOnError", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // React logs caught render errors to the console; keep test output clean.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("renders its children when nothing throws", () => {
    render(
      <FallbackOnError event="x" fallback={<span>fallback</span>}>
        <span>content</span>
      </FallbackOnError>,
    );
    expect(screen.getByText("content")).toBeTruthy();
    expect(mock.captureError).not.toHaveBeenCalled();
  });

  it("shows the fallback and reports once when a child throws", () => {
    render(
      <FallbackOnError
        event="x_import_render_failed"
        fallback={<span>fallback</span>}
      >
        <Throws />
      </FallbackOnError>,
    );
    expect(screen.getByText("fallback")).toBeTruthy();
    expect(mock.captureError).toHaveBeenCalledOnce();
    expect(mock.captureError).toHaveBeenCalledWith(
      "x_import_render_failed",
      expect.any(Error),
    );
  });
});
