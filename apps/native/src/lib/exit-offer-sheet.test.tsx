// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type PaywallProps = {
  onPurchasePackageInitiated: (event: {
    packageBeingPurchased: unknown;
    resume: (proceed: boolean) => void;
  }) => void;
  onPurchaseCompleted: () => void;
  onDismiss: () => void;
};

const mock = vi.hoisted(() => ({
  appState: null as ((state: string) => void) | null,
  paywall: null as PaywallProps | null,
  capture: vi.fn(),
  modal: ({ children }: { children: ReactNode }) => children,
}));

vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      mock.appState = listener;
      return { remove: () => (mock.appState = null) };
    },
  },
  Modal: mock.modal,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: mock.capture },
}));

const { ExitOfferSheetHost, presentExitSheet } =
  await import("./exit-offer-sheet");

function Paywall(props: PaywallProps) {
  mock.paywall = props;
  return null;
}

const offering = { identifier: "exit_offer" } as never;
const now = 1_000_000_000_000;

function open(endsAt = now + 60_000) {
  return presentExitSheet({
    Paywall: Paywall as never,
    offering,
    endsAt,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  mock.paywall = null;
  mock.capture.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("presentExitSheet", () => {
  it("does not present without a mounted host", async () => {
    await expect(open()).resolves.toBe("NOT_PRESENTED");
  });

  it("does not present an offer that already ended", async () => {
    const host = render(<ExitOfferSheetHost />);
    await expect(open(now)).resolves.toBe("NOT_PRESENTED");
    host.unmount();
  });

  it("reports a purchase made before the deadline", async () => {
    const host = render(<ExitOfferSheetHost />);
    const result = open();
    await act(async () => {});
    const resume = vi.fn();
    mock.paywall!.onPurchasePackageInitiated({
      packageBeingPurchased: {},
      resume,
    });
    expect(resume).toHaveBeenCalledWith(true);
    act(() => mock.paywall!.onPurchaseCompleted());
    await expect(result).resolves.toBe("PURCHASED");
    host.unmount();
  });

  it("closes itself at the deadline", async () => {
    const host = render(<ExitOfferSheetHost />);
    const result = open();
    await act(async () => {});
    expect(mock.paywall).not.toBeNull();

    await act(async () => vi.advanceTimersByTime(61_000));
    await expect(result).resolves.toBe("CANCELLED");
    expect(mock.capture).toHaveBeenCalledWith("exit_offer_expired_open", {});
    host.unmount();
  });

  it("closes on return to the app after the deadline", async () => {
    const host = render(<ExitOfferSheetHost />);
    const result = open();
    await act(async () => {});

    // Timers paused in the background; only the clock moved.
    vi.setSystemTime(now + 2 * 60_000);
    act(() => mock.appState!("active"));
    await expect(result).resolves.toBe("CANCELLED");
    host.unmount();
  });

  it("refuses a purchase tapped after the deadline", async () => {
    const host = render(<ExitOfferSheetHost />);
    const result = open();
    await act(async () => {});

    vi.setSystemTime(now + 60_000);
    const resume = vi.fn();
    act(() =>
      mock.paywall!.onPurchasePackageInitiated({
        packageBeingPurchased: {},
        resume,
      }),
    );
    expect(resume).toHaveBeenCalledWith(false);
    await expect(result).resolves.toBe("CANCELLED");
    host.unmount();
  });

  it("lets a purchase that follows the dismiss event win", async () => {
    const host = render(<ExitOfferSheetHost />);
    const result = open();
    await act(async () => {});
    act(() => {
      mock.paywall!.onDismiss();
      mock.paywall!.onPurchaseCompleted();
    });
    await act(async () => vi.advanceTimersByTime(1_000));
    await expect(result).resolves.toBe("PURCHASED");
    host.unmount();
  });

  it("reports a close as a cancel", async () => {
    const host = render(<ExitOfferSheetHost />);
    const result = open();
    await act(async () => {});
    act(() => mock.paywall!.onDismiss());
    await act(async () => vi.advanceTimersByTime(1_000));
    await expect(result).resolves.toBe("CANCELLED");
    host.unmount();
  });
});
