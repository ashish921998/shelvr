// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { SaveRecallCard } from "./save-recall-card";

const mock = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string, values?: Record<string, unknown>) =>
    values ? `${key} ${JSON.stringify(values)}` : key,
  formattingLocale: () => "en-US",
  useAppLocale: vi.fn(),
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/lib/save-recall", () => ({ RECALL_MAX_SHOWN: 3 }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: mock.push }) }));
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

const DAY = 24 * 60 * 60 * 1000;

function match(id: string, ageDays: number) {
  return {
    _id: id,
    _creationTime: Date.now() - ageDays * DAY,
    type: "link",
    status: "ready",
  } as unknown as Parameters<typeof SaveRecallCard>[0]["matches"][number];
}

beforeEach(() => {
  mock.push.mockReset();
});

it("names the new save and counts only the saves the stack shows", () => {
  render(
    <SaveRecallCard
      savedTitle="Spicy miso ramen"
      matches={[match("a", 10), match("b", 20), match("c", 30), match("d", 40)]}
      onOpen={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(
    screen.getByText(
      'home.recallStackTitle {"count":3,"title":"Spicy miso ramen"}',
    ),
  ).toBeDefined();
  expect(screen.getByText(/^home\.recallOldest /)).toBeDefined();
});

function renderedTitle(savedTitle: string) {
  render(
    <SaveRecallCard
      savedTitle={savedTitle}
      matches={[match("a", 10)]}
      onOpen={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  const text = screen.getByText(/^home\.recallStackTitle /).textContent ?? "";
  return (JSON.parse(text.slice(text.indexOf("{"))) as { title: string }).title;
}

it("keeps a short title whole", () => {
  expect(renderedTitle("  Ramen ")).toBe("Ramen");
});

it("shortens a long title to the room the sentence leaves", () => {
  const title = renderedTitle("Very long article title ".repeat(4));
  expect(title).toMatch(/^Very long\S*.*\S…$/);
  expect(title.length).toBeLessThan(20);
});

it("gives full-width characters half the letters", () => {
  const latin = renderedTitle("a".repeat(40));
  cleanup();
  const wide = renderedTitle("あ".repeat(40));
  expect(Array.from(wide).length - 1).toBe(
    Math.floor((Array.from(latin).length - 1) / 2),
  );
});

it("falls back to the generic line when the new save has no title", () => {
  render(
    <SaveRecallCard
      savedTitle={undefined}
      matches={[match("a", 10)]}
      onOpen={vi.fn()}
      onDismiss={vi.fn()}
    />,
  );
  expect(screen.getByText('home.recallBody {"count":1}')).toBeDefined();
  expect(screen.getByText(/^home\.recallSavedOn /)).toBeDefined();
});

it("opens the top match and reports it", () => {
  const onOpen = vi.fn();
  render(
    <SaveRecallCard
      savedTitle="Ramen"
      matches={[match("top", 10), match("next", 20)]}
      onOpen={onOpen}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByTestId("save-recall-open"));
  expect(onOpen).toHaveBeenCalledOnce();
  expect(mock.push).toHaveBeenCalledWith({
    pathname: "/item/[id]",
    params: { id: "top" },
  });
});

it("dismisses without opening anything", () => {
  const onDismiss = vi.fn();
  render(
    <SaveRecallCard
      savedTitle="Ramen"
      matches={[match("top", 10)]}
      onOpen={vi.fn()}
      onDismiss={onDismiss}
    />,
  );
  fireEvent.click(screen.getByTestId("save-recall-dismiss"));
  expect(onDismiss).toHaveBeenCalledOnce();
  expect(mock.push).not.toHaveBeenCalled();
});
