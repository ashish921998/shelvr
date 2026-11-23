// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/components/AppStoreButton", () => ({
  default: () => <a href="https://apps.apple.com/app/shelvr">Download</a>,
}));

import InviteActions from "./InviteActions";

const writeText = vi.fn(async (_text: string) => {});

beforeEach(() => {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  document.body.replaceChildren();
});

function renderActions(token: string) {
  const host = document.createElement("div");
  document.body.append(host);
  host.addEventListener("click", (event) => event.preventDefault());
  act(() => createRoot(host).render(<InviteActions token={token} />));
  return host;
}

function link(host: HTMLElement, text: string) {
  const found = [...host.querySelectorAll("a")].find(
    (a) => a.textContent === text,
  );
  if (!found) throw new Error(`no link ${text}`);
  return found;
}

it("copies the invite when someone taps Download, so the app can offer to join after the install", () => {
  const host = renderActions("tok 1");
  act(() =>
    link(host, "Download").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    ),
  );
  expect(writeText).toHaveBeenCalledWith(
    "https://shelvr-web.vercel.app/l/tok%201",
  );
});

it("keeps Open it as the app link for people who already have Shelvr", () => {
  const host = renderActions("tok1");
  expect(link(host, "Open it").getAttribute("href")).toBe(
    "shelvr://list-invite/tok1",
  );
});

it("copies the invite as a link, so the iPhone app can see a link waiting without asking to paste", () => {
  const write = vi.fn(async (_items: unknown[]) => {});
  class FakeClipboardItem {
    constructor(readonly types: Record<string, Blob>) {}
  }
  vi.stubGlobal("ClipboardItem", FakeClipboardItem);
  Object.defineProperty(navigator, "clipboard", {
    value: { write, writeText },
    configurable: true,
  });
  const host = renderActions("tok1");
  act(() =>
    link(host, "Download").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    ),
  );
  vi.unstubAllGlobals();
  const [[items]] = write.mock.calls as unknown as [[FakeClipboardItem[]]];
  expect(Object.keys(items[0]!.types).sort()).toEqual([
    "text/plain",
    "text/uri-list",
  ]);
  expect(writeText).not.toHaveBeenCalled();
});

it("still copies the plain link when the browser refuses to build a rich clipboard item", () => {
  const write = vi.fn(async (_items: unknown[]) => {});
  vi.stubGlobal(
    "ClipboardItem",
    class {
      constructor() {
        throw new TypeError("unsupported type");
      }
    },
  );
  Object.defineProperty(navigator, "clipboard", {
    value: { write, writeText },
    configurable: true,
  });
  const host = renderActions("tok1");
  act(() =>
    link(host, "Download").dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    ),
  );
  vi.unstubAllGlobals();
  expect(write).not.toHaveBeenCalled();
  expect(writeText).toHaveBeenCalledWith(
    "https://shelvr-web.vercel.app/l/tok1",
  );
});
