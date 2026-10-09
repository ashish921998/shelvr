// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { ProCard } from "./pro-card";

const mock = vi.hoisted(() => ({ eligible: vi.fn() }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/lib/entitlement", () => ({
  openPaywall: vi.fn(),
  readTrialEligible: mock.eligible,
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: vi.fn(({ label }: { label: string }) => <button>{label}</button>),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({}) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));

beforeEach(() => {
  mock.eligible.mockReset();
});

it("promises the trial only once the store says the account is eligible", async () => {
  let answer!: (eligible: boolean) => void;
  mock.eligible.mockReturnValue(
    new Promise<boolean>((resolve) => {
      answer = resolve;
    }),
  );
  render(<ProCard lapsed={false} />);
  expect(screen.queryByText("reveal.trialNote")).toBeNull();

  answer(true);
  await waitFor(() =>
    expect(screen.getByText("reveal.trialNote")).toBeDefined(),
  );
});

it("says nothing about a trial to an account that cannot get one", async () => {
  mock.eligible.mockResolvedValue(false);
  render(<ProCard lapsed={false} />);
  await waitFor(() => expect(mock.eligible).toHaveBeenCalled());
  expect(screen.queryByText("reveal.trialNote")).toBeNull();
});

it("never asks about the trial for a lapsed account", () => {
  render(<ProCard lapsed />);
  expect(mock.eligible).not.toHaveBeenCalled();
  expect(screen.queryByText("reveal.trialNote")).toBeNull();
});
