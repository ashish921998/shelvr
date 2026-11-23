// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { InviteOffer } from "./invite-offer";

const mocks = vi.hoisted(() => ({
  hasUrl: vi.fn(async () => true),
  hasString: vi.fn(async () => true),
  os: "ios",
  text: vi.fn(async () => ""),
  push: vi.fn(),
  alert: vi.fn(),
  captureError: vi.fn(),
  appState: undefined as ((state: string) => void) | undefined,
  pending: null as string | null,
}));

vi.mock("expo-clipboard", () => ({
  hasUrlAsync: mocks.hasUrl,
  hasStringAsync: mocks.hasString,
  getStringAsync: mocks.text,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/pending-invite", () => ({
  getPendingInvite: () => mocks.pending,
  subscribePendingInvite: () => () => {},
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
  Platform: {
    get OS() {
      return mocks.os;
    },
  },
  AppState: {
    addEventListener: (_: string, listener: (state: string) => void) => {
      mocks.appState = listener;
      return { remove: () => {} };
    },
  },
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({ children, onPress }: { children: ReactNode; onPress: () => void }) => (
      <button onClick={onPress}>{children}</button>
    ),
  ),
}));

beforeEach(() => {
  mocks.hasUrl.mockResolvedValue(true);
  mocks.push.mockClear();
  mocks.alert.mockClear();
  mocks.captureError.mockClear();
  mocks.pending = null;
  mocks.os = "ios";
});

async function renderOffer() {
  render(<InviteOffer />);
  await act(async () => {});
}

it("opens the invite when the clipboard holds a Shelvr invite link", async () => {
  mocks.text.mockResolvedValue("https://tryshelvr.app/l/tok1");
  await renderOffer();
  await act(async () => {
    fireEvent.click(screen.getByText("onboarding.joinList"));
  });
  expect(mocks.push).toHaveBeenCalledWith("/list-invite/tok1");
});

it("says so and keeps the line when the copied link is not an invite, so the person can copy the right one and try again", async () => {
  mocks.text.mockResolvedValue("https://www.instagram.com/reel/abc/");
  await renderOffer();
  await act(async () => {
    fireEvent.click(screen.getByText("onboarding.joinList"));
  });
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.alert).toHaveBeenCalledWith(
    "onboarding.noInviteTitle",
    "onboarding.noInviteBody",
  );
  expect(screen.getByText("onboarding.joinList")).toBeTruthy();
});

it("says no invite was found when the clipboard cannot be read", async () => {
  mocks.text.mockRejectedValue(new Error("paste denied"));
  await renderOffer();
  await act(async () => {
    fireEvent.click(screen.getByText("onboarding.joinList"));
  });
  expect(mocks.push).not.toHaveBeenCalled();
  expect(mocks.alert).toHaveBeenCalledWith(
    "onboarding.noInviteTitle",
    "onboarding.noInviteBody",
  );
  expect(mocks.captureError).toHaveBeenCalledWith(
    "clipboard_invite_read_failed",
    expect.any(Error),
  );
});

it("offers to join when the person comes back to the app after copying their invite", async () => {
  mocks.hasUrl.mockResolvedValue(false);
  await renderOffer();
  expect(screen.queryByText("onboarding.joinList")).toBeNull();
  mocks.hasUrl.mockResolvedValue(true);
  await act(async () => {
    mocks.appState?.("active");
  });
  expect(screen.getByText("onboarding.joinList")).toBeTruthy();
});

it("stays hidden with no link on the clipboard or an invite already waiting", async () => {
  mocks.hasUrl.mockResolvedValue(false);
  await renderOffer();
  expect(screen.queryByText("onboarding.joinList")).toBeNull();

  mocks.hasUrl.mockResolvedValue(true);
  mocks.pending = "tok1";
  await renderOffer();
  expect(screen.queryByText("onboarding.joinList")).toBeNull();
});

it("offers to join on Android, which can only tell that some text is copied", async () => {
  mocks.os = "android";
  mocks.hasUrl.mockRejectedValue(new Error("not available on Android"));
  mocks.text.mockResolvedValue("https://tryshelvr.app/l/tok2");
  await renderOffer();
  await act(async () => {
    fireEvent.click(screen.getByText("onboarding.joinList"));
  });
  expect(mocks.push).toHaveBeenCalledWith("/list-invite/tok2");
  expect(mocks.captureError).not.toHaveBeenCalled();
});

it("opens the invite once when the line is tapped twice quickly", async () => {
  mocks.text.mockResolvedValue("https://tryshelvr.app/l/tok1");
  await renderOffer();
  await act(async () => {
    fireEvent.click(screen.getByText("onboarding.joinList"));
    fireEvent.click(screen.getByText("onboarding.joinList"));
  });
  expect(mocks.push).toHaveBeenCalledTimes(1);
});
