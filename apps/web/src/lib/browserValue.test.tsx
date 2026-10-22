// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useBrowserValue } from "./browserValue";

function Probe() {
  return <>{useBrowserValue(() => window.location.pathname, "server")}</>;
}

describe("useBrowserValue", () => {
  it("reads the browser on the client", () => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    window.history.replaceState({}, "", "/client-path");
    const container = document.createElement("div");
    const root = createRoot(container);
    act(() => root.render(<Probe />));
    expect(container.textContent).toBe("/client-path");
    act(() => root.unmount());
  });

  it("renders the server value on the server, so hydration matches", () => {
    expect(renderToString(<Probe />)).toBe("server");
  });
});
