// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { SaveWithSiri } from "@/components/add-spots/save-with-siri";
import type { SiriShortcut } from "@/lib/siri-phrases";

const mocks = vi.hoisted(() => ({
  shortcuts: [] as readonly SiriShortcut[],
}));

vi.mock("@/lib/siri-phrases", () => ({
  useSiriShortcuts: () => mocks.shortcuts,
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/screen-title", () => ({
  ScreenTitle: vi.fn(({ title }: { title: string }) => <h1>{title}</h1>),
}));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(
    ({
      children,
      accessibilityRole,
    }: {
      children: ReactNode;
      accessibilityRole?: string;
    }) =>
      accessibilityRole === "header" ? <h2>{children}</h2> : <p>{children}</p>,
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { onTint: "#2b2418" } } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  ScrollView: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
}));

const { SIRI_SHORTCUTS } =
  await vi.importActual<typeof import("@/lib/siri-phrases")>(
    "@/lib/siri-phrases",
  );

it("lists each Siri action with its phrases in quotes", () => {
  mocks.shortcuts = SIRI_SHORTCUTS;
  render(<SaveWithSiri />);
  expect(screen.getByRole("heading", { name: "Save with Siri" })).toBeTruthy();
  expect(screen.getByText("Say one of these to Siri.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Save a Link" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Save a Note" })).toBeTruthy();
  for (const phrase of [
    "Save this page to Shelvr",
    "Save this link to Shelvr",
    "Save a note in Shelvr",
    "Add a note to Shelvr",
  ]) {
    expect(screen.getByText(`“${phrase}”`)).toBeTruthy();
  }
});

it("shows only the actions this iPhone's Siri has", () => {
  mocks.shortcuts = SIRI_SHORTCUTS.slice(0, 1);
  render(<SaveWithSiri />);
  expect(screen.getByRole("heading", { name: "Save a Link" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Save a Note" })).toBeNull();
  expect(screen.queryByText("“Save a note in Shelvr”")).toBeNull();
});
