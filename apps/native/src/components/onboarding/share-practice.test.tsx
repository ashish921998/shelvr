// @vitest-environment jsdom
// The practice step only counts a share that reaches Shelvr while it is on
// screen, and counts it once.
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => ({
  payloads: [] as unknown[],
  arrive: null as null | (() => void),
  present: vi.fn(),
  capture: vi.fn(),
  markPending: vi.fn(),
  haptic: vi.fn(),
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  button: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button type="button" onClick={onPress}>
      {label}
    </button>
  ),
  card: ({ onPress }: { onPress?: () => void }) => (
    <button type="button" onClick={onPress}>
      share-sample
    </button>
  ),
  nothing: () => null,
  steps: ({ active }: { active: number }) => <div>{`step-${active}`}</div>,
  row: ({ sample }: { sample: { pageHeading: string } }) => (
    <div>{sample.pageHeading}</div>
  ),
}));

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: mock.view,
  Text: mock.text,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: mock.view, Text: mock.text },
}));
vi.mock("@/lib/motion", () => ({ settleIn: () => ({}) }));
vi.mock("@/components/onboarding/celebration", () => ({
  CelebrationBadge: mock.nothing,
}));
vi.mock("expo-haptics", () => ({
  notificationAsync: mock.haptic,
  NotificationFeedbackType: { Success: "success" },
}));
vi.mock("expo-sharing", () => ({ getSharedPayloads: () => mock.payloads }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture, captureError: vi.fn() },
}));
vi.mock("@/lib/share/pending-share-store", () => ({
  markPendingShareOnDevice: mock.markPending,
}));
vi.mock("@/lib/share/share-sheet", () => ({
  presentShareSheet: mock.present,
  useShareArrival: (onArrive: () => void) => {
    mock.arrive = onArrive;
  },
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: mock.button,
  GhostButton: mock.button,
}));
vi.mock("@/components/onboarding/sample-card", () => ({
  SampleRow: mock.row,
}));
vi.mock("@/components/onboarding/practice-post", () => ({
  PracticePost: mock.card,
  ShareSteps: mock.steps,
}));

const { SharePracticeStep } =
  await import("@/components/onboarding/share-practice");
const { DEMO_SAMPLES } = await import("@/lib/onboarding-demo");

const received = () =>
  mock.capture.mock.calls.filter(
    ([, props]) => (props as { outcome: string }).outcome === "received",
  );

beforeEach(() => {
  vi.clearAllMocks();
  mock.payloads = [];
  mock.arrive = null;
});

describe("share practice", () => {
  it("says up front that this share is a practice run", () => {
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={vi.fn()}
      />,
    );
    expect(screen.getByText("sharePractice.eyebrow")).toBeTruthy();
  });

  it("opens the sheet from the step's own Share this post button", () => {
    mock.present.mockReturnValue(new Promise(() => undefined));
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("demo.shareThis"));
    expect(mock.present).toHaveBeenCalledTimes(1);
    expect(screen.getByText("step-2")).toBeTruthy();
  });

  it("lights the Shelvr step while the share sheet is open", async () => {
    let finish!: (result: string) => void;
    mock.present.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={vi.fn()}
      />,
    );
    expect(screen.getByText("step-1")).toBeTruthy();
    fireEvent.click(screen.getByText("share-sample"));
    expect(screen.getByText("step-2")).toBeTruthy();
    await act(async () => finish("dismissed"));
    expect(screen.getByText("step-1")).toBeTruthy();
  });

  it("asks again when a sheet iOS never showed is still unanswered", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    mock.present
      .mockReturnValueOnce(new Promise(() => undefined))
      .mockResolvedValueOnce("shelvr");
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("share-sample"));
    // A double tap while the sheet slides up asks for nothing more.
    now.mockReturnValue(2_500);
    fireEvent.click(screen.getByText("share-sample"));
    expect(mock.present).toHaveBeenCalledTimes(1);
    // Later, a tap on the post proves the first sheet never came up.
    now.mockReturnValue(3_500);
    await act(async () => {
      fireEvent.click(screen.getByText("share-sample"));
    });
    expect(mock.present).toHaveBeenCalledTimes(2);
    expect(mock.capture).toHaveBeenCalledWith("onboarding_share_practice", {
      outcome: "sheet_stuck",
    });
    expect(received()).toHaveLength(1);
    now.mockRestore();
  });

  it("does not count a tap after a sheet that was up as a stuck one", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    let settle!: () => void;
    let finish!: (result: string) => void;
    mock.present.mockImplementationOnce(
      (_url: string, _arrived: () => boolean, onSettled: () => void) =>
        new Promise((resolve) => {
          settle = onSettled;
          finish = resolve;
        }),
    );
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("share-sample"));
    // The sheet was up for a while, closed, and its result is on its way.
    now.mockReturnValue(9_000);
    settle();
    fireEvent.click(screen.getByText("share-sample"));
    expect(mock.present).toHaveBeenCalledTimes(1);
    await act(async () => finish("shelvr"));
    expect(received()).toHaveLength(1);
    expect(mock.capture).not.toHaveBeenCalledWith("onboarding_share_practice", {
      outcome: "sheet_stuck",
    });
    now.mockRestore();
  });

  it("lets the person leave while a sheet is unanswered", () => {
    mock.present.mockReturnValue(new Promise(() => undefined));
    const onFinish = vi.fn();
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={onFinish}
      />,
    );
    fireEvent.click(screen.getByText("share-sample"));
    fireEvent.click(screen.getByText("sharePractice.later"));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it("ignores a sheet that answers after the person left", async () => {
    let answer: (result: string) => void = () => undefined;
    mock.present.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    const onFinish = vi.fn();
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={onFinish}
      />,
    );
    fireEvent.click(screen.getByText("share-sample"));
    fireEvent.click(screen.getByText("sharePractice.later"));
    mock.capture.mockClear();
    await act(async () => {
      answer("failed");
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(mock.capture).not.toHaveBeenCalled();
  });

  it("counts a closed sheet, so a sheet that opened shows in the funnel", async () => {
    mock.present.mockResolvedValue("dismissed");
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={vi.fn()}
      />,
    );
    await act(async () => {
      fireEvent.click(screen.getByText("share-sample"));
    });
    expect(mock.capture).toHaveBeenCalledWith("onboarding_share_practice", {
      outcome: "dismissed",
    });
  });

  it("skips the practice when a share is already held, so it is not replaced", () => {
    mock.payloads = [{ value: "https://mine.test", shareType: "url" }];
    const onFinish = vi.fn();
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={onFinish}
      />,
    );
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("share-sample")).toBeNull();
    expect(mock.present).not.toHaveBeenCalled();
  });

  it("notices the practice share when it arrives", () => {
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={vi.fn()}
      />,
    );
    mock.payloads = [{ value: "https://new.test" }];
    act(() => mock.arrive?.());
    expect(received()).toHaveLength(1);
    expect(screen.getByText("sharePractice.savedTitle")).toBeTruthy();
    // The done screen names the link that was just shared.
    expect(screen.getByText(DEMO_SAMPLES[1].pageHeading)).toBeTruthy();
  });

  it("counts one share once when the listener and the sheet both see it", async () => {
    let finish!: (result: string) => void;
    mock.present.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <SharePracticeStep
        sample={DEMO_SAMPLES[1]}
        leaving={false}
        onFinish={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByText("share-sample"));

    mock.payloads = [{ value: "https://sample.test" }];
    act(() => mock.arrive?.());
    await act(async () => finish("shelvr"));

    expect(received()).toHaveLength(1);
    expect(mock.markPending).toHaveBeenCalledTimes(1);
  });
});
