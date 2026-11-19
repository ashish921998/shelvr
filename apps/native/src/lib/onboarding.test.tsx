// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { analytics } from "@/lib/analytics";

import { OnboardingProvider, useOnboarding } from "./onboarding";

const store = vi.hoisted(() => ({
  map: new Map<string, string>(),
  failRead: false,
  failWrite: false,
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => {
    if (store.failRead) throw new Error("ERR_KEY_CHAIN");
    return store.map.get(key) ?? null;
  },
  setItem: (key: string, value: string) => {
    if (store.failWrite) throw new Error("ERR_KEY_CHAIN");
    store.map.set(key, value);
  },
}));
vi.mock("@/lib/analytics", () => ({ analytics: { captureError: vi.fn() } }));

type Onboarding = ReturnType<typeof useOnboarding>;

function Probe({ sink }: { sink: Onboarding[] }) {
  sink.push(useOnboarding());
  return null;
}

describe("OnboardingProvider", () => {
  beforeEach(() => {
    store.map.clear();
    store.failRead = false;
    store.failWrite = false;
    vi.mocked(analytics.captureError).mockClear();
  });

  it("defaults to onboarded outside the provider", () => {
    const sink: Onboarding[] = [];
    render(<Probe sink={sink} />);
    expect(sink[0].onboarded).toBe(true);
  });

  it("starts not onboarded when nothing is persisted", () => {
    const sink: Onboarding[] = [];
    render(
      <OnboardingProvider>
        <Probe sink={sink} />
      </OnboardingProvider>,
    );
    expect(sink[0].onboarded).toBe(false);
  });

  it("completing onboarding persists the flag and flips the gate", () => {
    const sink: Onboarding[] = [];
    render(
      <OnboardingProvider>
        <Probe sink={sink} />
      </OnboardingProvider>,
    );
    expect(sink[0].onboarded).toBe(false);
    act(() => {
      sink[0].completeOnboarding();
    });
    expect(store.map.get("shelvr.onboarded")).toBe("true");
    expect(sink.at(-1)?.onboarded).toBe(true);
  });

  it("starts onboarded when the flag was persisted earlier", () => {
    store.map.set("shelvr.onboarded", "true");
    const sink: Onboarding[] = [];
    render(
      <OnboardingProvider>
        <Probe sink={sink} />
      </OnboardingProvider>,
    );
    expect(sink[0].onboarded).toBe(true);
  });

  it("treats an unreadable keychain as onboarded and reports it", () => {
    store.failRead = true;
    const sink: Onboarding[] = [];
    render(
      <OnboardingProvider>
        <Probe sink={sink} />
      </OnboardingProvider>,
    );
    expect(sink[0].onboarded).toBe(true);
    expect(analytics.captureError).toHaveBeenCalledWith(
      "onboarded_flag_read_failed",
      expect.any(Error),
    );
  });

  it("completes onboarding when the keychain refuses the write", () => {
    const sink: Onboarding[] = [];
    render(
      <OnboardingProvider>
        <Probe sink={sink} />
      </OnboardingProvider>,
    );
    store.failWrite = true;
    act(() => {
      sink[0].completeOnboarding();
    });
    expect(sink.at(-1)?.onboarded).toBe(true);
    expect(analytics.captureError).toHaveBeenCalledWith(
      "onboarded_flag_write_failed",
      expect.any(Error),
    );
  });
});
