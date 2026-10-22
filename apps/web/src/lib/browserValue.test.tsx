// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { useBrowserValue } from "./browserValue";

function Probe() {
  return <>{useBrowserValue(() => window.location.pathname, "server")}</>;
}

describe("useBrowserValue", () => {
  it("reads the browser on the client", () => {
    const { result } = renderHook(() =>
      useBrowserValue(() => window.location.pathname, "server"),
    );
    expect(result.current).toBe(window.location.pathname);
  });

  it("renders the server value on the server, so hydration matches", () => {
    expect(renderToString(<Probe />)).toBe("server");
  });
});
