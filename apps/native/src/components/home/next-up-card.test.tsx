// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { NextUpCard } from "./next-up-card";

const mock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: vi.fn(),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-router", () => ({
  useRouter: () => ({ push: mock.push }),
  useFocusEffect: vi.fn(),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({
    theme: { opacity: { pressed: 0.7 }, colors: {} },
  }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      testID,
    }: {
      children: ReactNode;
      onPress: () => void;
      testID: string;
    }) => (
      <button data-testid={testID} onClick={onPress}>
        {children}
      </button>
    ),
  ),
}));

it("opens the save on its own page, not at its place in the home pager", () => {
  const onOpen = vi.fn();
  render(
    <NextUpCard
      next={
        {
          kind: "open",
          subject: "Agentic SEO Strategy",
          item: { _id: "item1", type: "link", status: "ready" },
        } as unknown as Parameters<typeof NextUpCard>[0]["next"]
      }
      onShown={vi.fn()}
      onOpen={onOpen}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByTestId("next-up-open"));
  expect(onOpen).toHaveBeenCalledOnce();
  expect(mock.push).toHaveBeenCalledWith({
    pathname: "/item/[id]",
    params: { id: "item1", from: "next-up" },
  });
});
