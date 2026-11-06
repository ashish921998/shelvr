// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaveAllLink from "./SaveAllLink";

const mocks = vi.hoisted(() => ({ capture: vi.fn() }));
vi.mock("@/lib/analytics", () => ({
  captureWebAnalyticsEvent: mocks.capture,
}));

const TOKEN = "0123456789abcdef0123456789abcdef";
const HREF = `shelvr:///?creatorMap=${TOKEN}&city=Mexico%20City`;

let container: HTMLDivElement;
let root: Root;
let navigationBlocked: boolean[];

function recordNavigation(event: Event) {
  navigationBlocked.push(event.defaultPrevented);
  event.preventDefault();
}

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mocks.capture.mockReset();
  navigationBlocked = [];
  document.addEventListener("click", recordNavigation);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.removeEventListener("click", recordNavigation);
});

function link(inApp?: "instagram") {
  act(() =>
    root.render(
      <SaveAllLink
        href={HREF}
        label="Save all to Shelvr"
        token={TOKEN}
        places={4}
        cities={1}
        inApp={inApp}
      />,
    ),
  );
  return container.querySelector("a")!;
}

async function settle() {
  await act(async () => {
    await vi.waitFor(() => expect(mocks.capture).toHaveBeenCalled());
  });
}

describe("SaveAllLink", () => {
  it("counts the tap with the page's hashed reference and lets the link open the app", async () => {
    const anchor = link("instagram");
    expect(anchor.getAttribute("href")).toBe(HREF);
    expect(anchor.textContent).toBe("Save all to Shelvr");

    act(() => anchor.click());
    await settle();

    expect(navigationBlocked).toEqual([false]);
    expect(anchor.getAttribute("href")).toBe(HREF);
    expect(mocks.capture).toHaveBeenCalledTimes(1);
    const [event, properties] = mocks.capture.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(event).toBe("creator_map_save_clicked");
    expect(properties).toEqual({
      places: 4,
      cities: 1,
      in_app: "instagram",
      share_ref: expect.stringMatching(/^[0-9a-f]{16}$/),
    });
    const sent = JSON.stringify(properties);
    expect(sent).not.toContain(TOKEN);
    expect(sent).not.toContain("Mexico");
  });

  it("leaves in_app out in a real browser", async () => {
    const anchor = link();
    act(() => anchor.click());
    await settle();
    const [, properties] = mocks.capture.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(properties).not.toHaveProperty("in_app");
    expect(properties.places).toBe(4);
  });
});
