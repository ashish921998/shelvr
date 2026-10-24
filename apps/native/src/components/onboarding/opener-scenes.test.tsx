// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => {
  const layouts: ((event: unknown) => void)[] = [];
  return {
    layouts,
    view: ({ children }: Children) => <div>{children}</div>,
    measuredView: ({
      children,
      onLayout,
    }: Children & { onLayout?: (event: unknown) => void }) => {
      if (onLayout) layouts.push(onLayout);
      return <div>{children}</div>;
    },
    text: ({ children }: Children) => <span>{children}</span>,
    nothing: () => null,
    icon: ({ name }: { name: string }) => <i>{`icon:${name}`}</i>,
  };
});

vi.mock("react-native", () => ({
  View: mock.measuredView,
  Text: mock.text,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    absoluteFillObject: {},
  },
  useUnistyles: () => ({
    theme: {
      colors: new Proxy({}, { get: () => "color" }),
    },
  }),
}));
vi.mock("react-native-reanimated", () => ({ default: { View: mock.view } }));
vi.mock("expo-image", () => ({ Image: mock.nothing }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mock.icon }));
vi.mock("@/components/onboarding/opener-phone", () => ({ PHONE_CUT: 40 }));
vi.mock("@/lib/motion", () => ({ riseIn: {} }));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));

const { FiledToast, FileScene, PlanScene, ShareScene } =
  await import("@/components/onboarding/opener-scenes");

describe("opener scenes", () => {
  it("raises the share sheet, Shelvr among the apps, once the page is reached", () => {
    const { rerender } = render(<ShareScene shown={false} />);
    expect(screen.getByText("icon:square.and.arrow.up.fill")).toBeTruthy();
    expect(screen.queryByText("onboarding.sceneMessages")).toBeNull();
    rerender(<ShareScene shown />);
    expect(screen.getByText("onboarding.sceneMessages")).toBeTruthy();
    expect(screen.getByText("onboarding.sceneNotes")).toBeTruthy();
    expect(screen.getByText("Shelvr")).toBeTruthy();
    expect(screen.getByText("onboarding.sceneMore")).toBeTruthy();
  });

  it("files four places into the Lisbon space", () => {
    render(<FileScene shown />);
    expect(screen.getByText("onboarding.sceneLisbon")).toBeTruthy();
    expect(screen.getByText("onboarding.sceneSpaceMeta")).toBeTruthy();
    for (const place of ["Pasteis", "Miradouro", "TimeOut", "LxFactory"])
      expect(screen.getByText(`onboarding.scene${place}`)).toBeTruthy();
    expect(screen.getAllByText("onboarding.scenePlaceTag")).toHaveLength(4);
    render(<FiledToast />);
    expect(screen.getByText("onboarding.sceneFiled")).toBeTruthy();
  });

  it("plans the day with four numbered stops", () => {
    render(<PlanScene shown />);
    act(() => {
      for (const onLayout of mock.layouts)
        onLayout({ nativeEvent: { layout: { width: 200, height: 160 } } });
    });
    expect(screen.getByText("onboarding.sceneDayTitle")).toBeTruthy();
    for (const number of ["1", "2", "3", "4"])
      expect(screen.getByText(number)).toBeTruthy();
    for (const slot of ["Morning", "Lunch", "Afternoon", "Evening"])
      expect(screen.getByText(`onboarding.scene${slot}`)).toBeTruthy();
  });
});
