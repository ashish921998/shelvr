// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { ahaSample } from "@/lib/aha-sample";
import { CarouselStep } from "./carousel";

type Children = { children?: ReactNode };
type LayoutEvent = { nativeEvent: { layout: { width: number } } };

const mock = vi.hoisted(() => ({
  view: ({ children }: Children) => <div>{children}</div>,
  text: ({ children }: Children) => <span>{children}</span>,
  button: ({ label }: { label: string }) => (
    <button type="button">{label}</button>
  ),
}));

vi.mock("react-native", async () => {
  const { useEffect } = await import("react");
  function View({
    children,
    onLayout,
  }: Children & { onLayout?: (event: LayoutEvent) => void }) {
    useEffect(() => {
      onLayout?.({ nativeEvent: { layout: { width: 390 } } });
    }, [onLayout]);
    return <div>{children}</div>;
  }
  return { ScrollView: mock.view, Text: mock.text, View };
});
vi.mock("react-native-reanimated", () => ({ useReducedMotion: () => false }));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/use-large-text", () => ({ HEADLINE_MAX_SCALE: 2 }));
vi.mock("@/components/onboarding/parts", () => ({
  PillButton: mock.button,
  ScalePressable: mock.view,
}));

afterEach(cleanup);

it("labels a trip walk's slides for a trip when Austin's reel stands in for Barcelona", () => {
  render(
    <CarouselStep
      sample={ahaSample("trip", "barcelona")}
      onContinue={vi.fn()}
    />,
  );

  expect(screen.getAllByText("homePlaces.planTrip")).toHaveLength(2);
  expect(screen.getByText("common.share")).toBeTruthy();
  expect(screen.queryByText("homePlaces.planDate")).toBeNull();
  expect(screen.queryByText("datePlan.send")).toBeNull();
  expect(screen.getAllByText("Austin Motel")).toHaveLength(2);
  expect(screen.getAllByText("Heritage Boot Co.")).toHaveLength(2);
  expect(screen.getAllByText("Jo's Coffee")).toHaveLength(1);
});

it("offers to send a date night's spots to the date", () => {
  render(
    <CarouselStep sample={ahaSample("date", "austin")} onContinue={vi.fn()} />,
  );

  expect(screen.getAllByText("homePlaces.planDate")).toHaveLength(2);
  expect(screen.getByText("datePlan.send")).toBeTruthy();
  expect(screen.queryByText("homePlaces.planTrip")).toBeNull();
  expect(screen.queryByText("common.share")).toBeNull();
  expect(screen.getAllByText("Eberly")).toHaveLength(2);
  expect(screen.getAllByText("The Guest House")).toHaveLength(2);
  expect(screen.getAllByText("Jupiter Supper Club")).toHaveLength(1);
});

it("plans a weekend like a date and shares it", () => {
  render(
    <CarouselStep
      sample={ahaSample("weekend", "austin")}
      onContinue={vi.fn()}
    />,
  );

  expect(screen.getAllByText("homePlaces.planDate")).toHaveLength(2);
  expect(screen.getByText("common.share")).toBeTruthy();
  expect(screen.queryByText("datePlan.send")).toBeNull();
  expect(screen.getAllByText("Hula Hut")).toHaveLength(2);
  expect(screen.getAllByText("Ski Shores Cafe")).toHaveLength(2);
  expect(screen.getAllByText("Quince Lakehouse")).toHaveLength(1);
});
