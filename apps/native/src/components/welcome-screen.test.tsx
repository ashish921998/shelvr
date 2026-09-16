// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import Page from "@/app/(auth)/sign-in";

const auth = vi.hoisted(() => ({
  signInWith: vi.fn(),
  pendingProvider: null as string | null,
  lastError: null as string | null,
}));
vi.mock("@/lib/oauth-sign-in", () => ({ useOAuthSignIn: () => auth }));
vi.mock("@/components/welcome-glass", () => ({
  WelcomeGlass: vi.fn(() => <div />),
}));
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => <div>{children}</div>),
  ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(
    ({
      children,
      accessibilityRole,
    }: {
      children: ReactNode;
      accessibilityRole?: "alert";
    }) => <span role={accessibilityRole}>{children}</span>,
  ),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
    }: {
      children: ReactNode;
      onPress: () => void;
      disabled: boolean;
    }) => (
      <button onClick={onPress} disabled={disabled}>
        {children}
      </button>
    ),
  ),
  ActivityIndicator: vi.fn(() => <div role="progressbar" />),
  Linking: { openURL: vi.fn() },
  Platform: { OS: "ios" },
  useColorScheme: () => "light",
  useWindowDimensions: () => ({ width: 390, height: 844 }),
}));
vi.mock("expo-apple-authentication", () => ({
  AppleAuthenticationButtonType: { CONTINUE: 0 },
  AppleAuthenticationButtonStyle: { WHITE: 0, BLACK: 1 },
  AppleAuthenticationButton: vi.fn(
    ({
      onPress,
      pointerEvents,
    }: {
      onPress: () => void;
      pointerEvents: string;
    }) => (
      <button onClick={onPress} disabled={pointerEvents === "none"}>
        Continue with Apple
      </button>
    ),
  ),
}));

beforeEach(() => {
  vi.stubGlobal("__DEV__", false);
  auth.pendingProvider = null;
  auth.lastError = null;
  auth.signInWith.mockClear();
});

it("keeps both provider actions connected from the welcome screen", () => {
  render(<Page />);
  expect(screen.getByText("Save it for later.")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue with Apple" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(auth.signInWith.mock.calls).toEqual([["apple"], ["google"]]);
  expect(screen.queryByText("Continue without account")).toBeNull();
});

it("shows progress and prevents another provider press while signing in", () => {
  auth.pendingProvider = "google";
  render(<Page />);
  expect(screen.getByRole("progressbar")).toBeTruthy();
  expect(screen.getByText("Signing in")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Continue with Apple" }));
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(auth.signInWith).not.toHaveBeenCalled();
});

it("announces a failure and leaves the actions available for retry", () => {
  auth.lastError = "Unable to sign in";
  render(<Page />);
  expect(screen.getByRole("alert").textContent).toBe("Unable to sign in");
  expect(screen.queryByRole("progressbar")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Continue with Google" }));
  expect(auth.signInWith).toHaveBeenCalledWith("google");
});
