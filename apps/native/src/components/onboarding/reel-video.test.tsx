// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

type Message = { nativeEvent: { data: string } };

const mock = vi.hoisted(() => {
  const onMessage: ((event: Message) => void)[] = [];
  return {
    onMessage,
    view: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
    webView: ({
      onMessage: listen,
    }: {
      onMessage: (event: Message) => void;
    }) => {
      onMessage.push(listen);
      return null;
    },
    captureError: vi.fn(),
  };
});

vi.mock("react-native", () => ({
  View: mock.view,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}), absoluteFill: {} },
}));
vi.mock("@expo/dom-webview", () => ({
  DomWebView: mock.webView,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));

async function freshReelVideo() {
  vi.resetModules();
  return (await import("./reel-video")).ReelVideo;
}

function say(data: string) {
  act(() => mock.onMessage.at(-1)!({ nativeEvent: { data } }));
}

beforeEach(() => {
  mock.onMessage.length = 0;
  mock.captureError.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("reports a failed reel with its code and the known cause", async () => {
  const ReelVideo = await freshReelVideo();
  render(<ReelVideo reelCode="DFvbj_8vC6x" onPlaying={vi.fn()} />);
  say("failed:NotAllowedError");
  expect(mock.captureError).toHaveBeenCalledWith(
    "onboarding_reel_unavailable",
    new Error("failed"),
    {
      reason: "failed",
      reel_code: "DFvbj_8vC6x",
      failure_cause: "NotAllowedError",
    },
  );
});

it("sends an unknown cause for anything off the list", async () => {
  const ReelVideo = await freshReelVideo();
  render(<ReelVideo reelCode="DFvbj_8vC6x" onPlaying={vi.fn()} />);
  say("failed:https://example.com/secret");
  expect(mock.captureError.mock.calls[0][2]).toEqual({
    reason: "failed",
    reel_code: "DFvbj_8vC6x",
    failure_cause: "unknown",
  });
});

it("reports a missing reel without a cause", async () => {
  const ReelVideo = await freshReelVideo();
  render(<ReelVideo reelCode="DFvbj_8vC6x" onPlaying={vi.fn()} />);
  say("missing");
  expect(mock.captureError.mock.calls[0][2]).toEqual({
    reason: "missing",
    reel_code: "DFvbj_8vC6x",
  });
});

it("reports only once a session, however often the reel comes back", async () => {
  vi.useFakeTimers();
  const ReelVideo = await freshReelVideo();
  const first = render(
    <ReelVideo reelCode="DFvbj_8vC6x" onPlaying={vi.fn()} />,
  );
  say("failed:NotAllowedError");
  first.unmount();
  render(<ReelVideo reelCode="DFvbj_8vC6x" onPlaying={vi.fn()} />);
  say("failed:NotAllowedError");
  render(<ReelVideo reelCode="DF6mZ9-Ml-s" onPlaying={vi.fn()} />);
  act(() => vi.advanceTimersByTime(15_000));
  expect(mock.captureError).toHaveBeenCalledTimes(1);
});

it("hides the reel when it fails and shows it once it plays", async () => {
  const ReelVideo = await freshReelVideo();
  const onPlaying = vi.fn();
  render(<ReelVideo reelCode="DFvbj_8vC6x" onPlaying={onPlaying} />);
  say("playing");
  say("failed:media_4");
  expect(onPlaying.mock.calls).toEqual([[true], [false]]);
});
