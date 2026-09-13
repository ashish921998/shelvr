// @vitest-environment jsdom
// Tests for the onboarding gate. SecureStore is stubbed with an in-memory map,
// so the persistence contract is observable: the provider starts from the
// stored flag and completeOnboarding persists before flipping state.
import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { OnboardingProvider, useOnboarding } from "./onboarding";

const store = vi.hoisted(() => ({
  map: new Map<string, string>(),
}));
vi.mock("expo-secure-store", () => ({
  getItem: (key: string) => store.map.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.map.set(key, value);
  },
}));

type Onboarding = ReturnType<typeof useOnboarding>;

// Renders nothing; hands the context value it sees to the test.
function Probe({ sink }: { sink: Onboarding[] }) {
  sink.push(useOnboarding());
  return null;
}

describe("OnboardingProvider", () => {
  beforeEach(() => {
    store.map.clear();
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
    // The state flip produces a new context value on the re-render.
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
});
