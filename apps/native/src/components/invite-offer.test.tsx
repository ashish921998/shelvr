// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { InviteOffer } from "./invite-offer";

const mocks = vi.hoisted(() => ({
  hasUrl: vi.fn(async () => true),
  text: vi.fn(async () => ""),
  push: vi.fn(),
  alert: vi.fn(),
  pending: null as string | null,
}));

vi.mock("expo-clipboard", () => ({
  hasUrlAsync: mocks.hasUrl,
  getStringAsync: mocks.text,
}));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/pending-invite", () => ({
  getPendingInvite: () => mocks.pending,
  subscribePendingInvite: () => () => {},
}));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native", () => ({
  Alert: { alert: mocks.alert },
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
  mocks.pending = null;
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
