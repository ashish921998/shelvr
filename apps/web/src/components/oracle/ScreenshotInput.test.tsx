// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ScreenshotInput from "./ScreenshotInput";

const MB = 1024 * 1024;

function render() {
  const onSubmit = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<ScreenshotInput busy={false} onSubmit={onSubmit} />));
  const input = container.querySelector("input[type=file]") as HTMLInputElement;
  const button = container.querySelector(
    "button[type=submit]",
  ) as HTMLButtonElement;
  return {
    container,
    onSubmit,
    button,
    pick(size: number) {
      const file = new File([new Uint8Array(size)], "shot.png", {
        type: "image/png",
      });
      Object.defineProperty(input, "files", {
        value: [file],
        configurable: true,
      });
      act(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    },
    async submit() {
      await act(async () => button.click());
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function stubEncoder(base64Chars: number) {
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 1290, height: 2796, close: vi.fn() })),
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
    `data:image/jpeg;base64,${"A".repeat(base64Chars)}`,
  );
}

describe("ScreenshotInput", () => {
  beforeEach(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    URL.createObjectURL = vi.fn(() => "blob:preview");
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("takes a full-size phone screenshot over 4 MB, since it is shrunk before sending", async () => {
    stubEncoder(800_000);
    const view = render();
    view.pick(6 * MB);
    expect(view.container.textContent).not.toContain("over");
    expect(view.button.disabled).toBe(false);
    await view.submit();
    expect(view.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "screenshot", mediaType: "image/jpeg" }),
    );
    view.unmount();
  });

  it("refuses a file too big to decode safely", () => {
    const view = render();
    view.pick(21 * MB);
    expect(view.container.textContent).toContain("over 20 MB");
    expect(view.button.disabled).toBe(true);
    view.unmount();
  });

  it("says so instead of sending when the shrunk image is still over the oracle's limit", async () => {
    stubEncoder(4 * MB + 1);
    const view = render();
    view.pick(5 * MB);
    await view.submit();
    expect(view.onSubmit).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain("too big for the oracle");
    view.unmount();
  });
});
