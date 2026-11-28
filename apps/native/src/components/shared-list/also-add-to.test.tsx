// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { Id } from "@convex/_generated/dataModel";
import { AlsoAddTo } from "./also-add-to";

const mocks = vi.hoisted(() => ({ toggle: vi.fn() }));

vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/shared-lists", () => ({
  alsoAddLists: () => [{ _id: "list-1", name: "Date night", members: [] }],
  partnerName: () => "",
  useAlsoAddTo: () => ({ state: {}, toggle: mocks.toggle }),
  useSharedLists: () => ({ data: [] }),
  withLine: () => "just you",
}));
vi.mock("@/components/shared-list/member-avatars", () => ({
  MemberAvatars: vi.fn(() => null),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/themed-text", () => ({
  ThemedText: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
}));
vi.mock("@/lib/motion", () => ({
  motion: { scale: { pressed: 1 }, duration: { feedback: 0 } },
  motionCSS: { out: "ease" },
}));
vi.mock("@/lib/use-live-reduced-motion", () => ({
  useLiveReducedMotion: () => true,
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    View: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
  },
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => new Proxy({}, { get: () => ({}) }) },
  useUnistyles: () => ({ theme: { colors: new Proxy({}, { get: () => "" }) } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: ReactNode }) => (
    <section>{children}</section>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      accessibilityLabel?: string;
    }) => (
      <button onClick={onPress} aria-label={accessibilityLabel}>
        {children}
      </button>
    ),
  ),
}));

const ITEM = "item-1" as Id<"items">;
const row = () => screen.getByLabelText("Date night, just you");

beforeEach(() => {
  mocks.toggle.mockReset().mockResolvedValue(undefined);
});

it("toggles once when the row is tapped again while the flush runs", async () => {
  let finish = (_: boolean) => {};
  const beforeToggle = vi.fn(
    () => new Promise<boolean>((resolve) => (finish = resolve)),
  );
  render(
    <AlsoAddTo
      itemId={ITEM}
      city="Austin"
      count={2}
      beforeToggle={beforeToggle}
    />,
  );
  fireEvent.click(row());
  fireEvent.click(row());
  await act(async () => finish(true));
  expect(beforeToggle).toHaveBeenCalledOnce();
  expect(mocks.toggle).toHaveBeenCalledOnce();
});

it("does not copy the save's places when its removals could not be written", async () => {
  render(
    <AlsoAddTo
      itemId={ITEM}
      city="Austin"
      count={2}
      beforeToggle={() => Promise.resolve(false)}
    />,
  );
  await act(async () => fireEvent.click(row()));
  expect(mocks.toggle).not.toHaveBeenCalled();
  await act(async () => fireEvent.click(row()));
  expect(mocks.toggle).not.toHaveBeenCalled();
});
