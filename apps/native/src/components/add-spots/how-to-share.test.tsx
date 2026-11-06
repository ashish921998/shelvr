// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import { HowToShare } from "@/components/add-spots/how-to-share";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  success: vi.fn(async () => {}),
}));

vi.mock("@/components/onboarding/aha-share", () => ({
  AhaSharePractice: vi.fn(({ onPick }: { onPick: () => void }) => (
    <button onClick={onPick}>Shelvr</button>
  )),
}));
vi.mock("@/lib/aha-sample", () => ({ ahaSample: () => ({}) }));
vi.mock("@/lib/haptics", () => ({ haptics: { success: mocks.success } }));
vi.mock("@/components/screen-title", () => ({
  ScreenTitle: vi.fn(({ title }: { title: string }) => <h1>{title}</h1>),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  )),
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ back: mocks.back }) }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
}));

beforeEach(() => {
  mocks.back.mockReset();
  mocks.success.mockClear();
});

it("titles the practice share and asks to save the sample reel", () => {
  render(<HowToShare />);
  expect(screen.getByRole("heading", { name: "How to share" })).toBeTruthy();
  expect(screen.getByText("Try saving this reel.")).toBeTruthy();
});

it("goes back once, with the success tap, when Shelvr is picked", () => {
  render(<HowToShare />);
  const shelvr = screen.getByRole("button", { name: "Shelvr" });
  fireEvent.click(shelvr);
  fireEvent.click(shelvr);
  expect(mocks.success).toHaveBeenCalledOnce();
  expect(mocks.back).toHaveBeenCalledOnce();
});
