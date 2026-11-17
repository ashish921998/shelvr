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
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));

const { DayStops, MapPin, SceneMap } =
  await import("@/components/onboarding/opener-scenes");

describe("Sign-in preview", () => {
  it("shows map pins once the map is measured", () => {
    render(
      <SceneMap>
        {() => <MapPin number={1} point={{ x: 0.2, y: 0.6 }} />}
      </SceneMap>,
    );
    expect(screen.queryByText("1")).toBeNull();
    act(() => {
      for (const onLayout of mock.layouts)
        onLayout({ nativeEvent: { layout: { width: 200, height: 160 } } });
    });
    expect(screen.getByText("1")).toBeTruthy();
  });

  it("shows the date title, time and place", () => {
    render(
      <DayStops
        title="Date night · Alfama"
        stops={[
          { slot: "signInScene.sunset", name: "onboarding.sceneMiradouro" },
        ]}
      />,
    );
    expect(screen.getByText("Date night · Alfama")).toBeTruthy();
    expect(screen.getByText("signInScene.sunset")).toBeTruthy();
    expect(screen.getByText("onboarding.sceneMiradouro")).toBeTruthy();
  });
});
