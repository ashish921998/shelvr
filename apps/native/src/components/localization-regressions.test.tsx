// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { AnimatedText } from "./animated-text";
import { TidyDone } from "./tidy/tidy-done";
import { SetupStep } from "./onboarding/setup";
import { onboardingLabel } from "@/lib/onboarding-labels";
import { getSpacePresets } from "@/lib/save-kinds";

const device = vi.hoisted(() => ({
  tag: "en-US",
  fontReady: true,
  listeners: new Set<() => void>(),
}));
// The native asset loader normally handles this require; Node has no OTF loader.
vi.hoisted(async () => {
  const { createRequire } = await import("node:module");
  const load = createRequire(import.meta.url);
  load.extensions[".otf"] = (module) => {
    module.exports = "font-asset";
  };
});
vi.mock("expo-localization", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    getLocales: () => [{ languageTag: device.tag }],
    useLocales: () => [
      {
        languageTag: useSyncExternalStore(
          (listener) => {
            device.listeners.add(listener);
            return () => {
              device.listeners.delete(listener);
            };
          },
          () => device.tag,
        ),
      },
    ],
  };
});
vi.mock("react-native", () => {
  const flatten = (style: unknown): Record<string, unknown> =>
    Array.isArray(style)
      ? Object.assign({}, ...style.map(flatten))
      : ((style ?? {}) as Record<string, unknown>);
  return {
    View: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
    ScrollView: vi.fn(({ children }: { children: ReactNode }) => (
      <div>{children}</div>
    )),
    Text: vi.fn(
      ({ children, style }: { children: ReactNode; style?: unknown }) => (
        <span data-testid="native-text" data-font={flatten(style).fontFamily}>
          {children}
        </span>
      ),
    ),
    Pressable: vi.fn(
      ({
        children,
        onPress,
        disabled,
      }: {
        children: ReactNode;
        onPress?: () => void;
        disabled?: boolean;
      }) => (
        <button onClick={onPress} disabled={disabled}>
          {children}
        </button>
      ),
    ),
    ActivityIndicator: vi.fn(() => null),
    TextInput: vi.fn(() => <input />),
    StyleSheet: { flatten },
  };
});
vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({
    theme: { colors: { foreground: "black", primary: "orange" } },
  }),
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native-reanimated", async () => {
  const { useRef } = await import("react");
  const { Text, View } = await import("react-native");
  const transition = { duration: () => transition, delay: () => transition };
  return {
    default: { View, Text },
    FadeIn: transition,
    FadeInDown: transition,
    useSharedValue: (initial: number) =>
      useRef({
        value: initial,
        get() {
          return this.value;
        },
        set(value: number) {
          this.value = value;
        },
      }).current,
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (value: number) => value,
    withSpring: (value: number) => value,
    withDelay: (_delay: number, value: number) => value,
  };
});
vi.mock("@shopify/react-native-skia", () => {
  const font = {
    getGlyphIDs: (text: string) =>
      [...text].map((char) => (char === "ƀ" ? 0 : 1)),
    getGlyphWidths: (ids: number[]) => ids.map(() => 10),
  };
  return {
    useFont: () => (device.fontReady ? font : null),
    Canvas: vi.fn(({ children }: { children: ReactNode }) => (
      <div data-testid="canvas">{children}</div>
    )),
    Group: vi.fn(({ children }: { children: ReactNode }) => <>{children}</>),
    Text: vi.fn(({ text }: { text: string }) => (
      <span data-testid="glyph">{text}</span>
    )),
    BlurMask: vi.fn(() => null),
  };
});
vi.mock("@/components/symbol", () => ({
  AppSymbolIcon: vi.fn(() => null),
}));
vi.mock("./onboarding/parts", () => ({
  CtaButton: vi.fn(({ label }: { label: string }) => <button>{label}</button>),
}));

function changeLanguage(tag: string) {
  act(() => {
    device.tag = tag;
    device.listeners.forEach((listener) => listener());
  });
}
beforeEach(() => {
  device.tag = "en-US";
  device.fontReady = true;
});

it("never animates an old Latin title after a native-shaped title", () => {
  const { rerender } = render(<AnimatedText text="OLD" />);
  expect(screen.getByTestId("canvas").textContent).toBe("OLD");
  rerender(<AnimatedText text="日本語" />);
  expect(screen.queryByTestId("canvas")).toBeNull();
  expect(screen.getByText("日本語")).toBeTruthy();
  rerender(<AnimatedText text="NEW" />);
  expect(screen.getByTestId("canvas").textContent).toBe("NEW");
});

it("keeps the Latin font and punctuation morph, falling back for missing glyphs", () => {
  device.fontReady = false;
  const { rerender } = render(
    <AnimatedText text="Loading" style={{ fontFamily: "Display" }} />,
  );
  expect(screen.getByTestId("native-text").getAttribute("data-font")).toBe(
    "Display",
  );
  device.fontReady = true;
  rerender(<AnimatedText text="Café — saved…" />);
  expect(screen.getByTestId("canvas").textContent).toBe("Café — saved…");
  rerender(<AnimatedText text="ƀ" />);
  expect(screen.queryByTestId("canvas")).toBeNull();
});

it("translates the singular deleted-photo summary on a mounted screen", () => {
  render(
    <TidyDone
      counts={{ kept: 0, saved: 0, deleted: 1 }}
      pendingDeleteCount={0}
      sourceTitle="My album"
      empty={false}
      loading={false}
      onContinue={() => {}}
    />,
  );
  expect(screen.getByText(/1 photo deleted/)).toBeTruthy();
  changeLanguage("ja-JP");
  expect(screen.queryByText(/1 photo deleted/)).toBeNull();
  expect(screen.queryByText(/1 deleted/)).toBeNull();
});

it("preserves selected preset identities and focused setup chips across languages", () => {
  let selected: string[] = [];
  const toggleKind = vi.fn();
  function Setup() {
    const [spaces, setSpaces] = useState(getSpacePresets(["Recipes"]));
    selected = spaces;
    return (
      <SetupStep
        kinds={["Recipes"]}
        spaces={spaces}
        onToggleKind={toggleKind}
        onToggleSpace={(name) =>
          setSpaces((prev) => prev.filter((item) => item !== name))
        }
        onAddSpace={() => {}}
        onAdvance={() => {}}
      />
    );
  }
  render(<Setup />);
  const chip = screen.getByRole("button", {
    name: onboardingLabel("Restaurants to try"),
  });
  chip.focus();
  changeLanguage("de-DE");
  expect(document.activeElement).toBe(chip);
  expect(chip.textContent).toBe(onboardingLabel("Restaurants to try"));
  expect(chip.textContent).not.toBe("Restaurants to try");
  fireEvent.click(chip);
  expect(selected).not.toContain("Restaurants to try");
  expect(selected).toContain("Recipes");

  const kindTile = screen.getByRole("button", {
    name: onboardingLabel("Fitness"),
  });
  kindTile.focus();
  changeLanguage("ja-JP");
  expect(document.activeElement).toBe(kindTile);
  fireEvent.click(kindTile);
  expect(toggleKind).toHaveBeenCalledWith("Fitness");
});

vi.mock("@/components/empty-state", () => ({ EmptyState: vi.fn(() => null) }));
vi.mock("@/components/ui/screen-loader", () => ({
  ScreenLoader: vi.fn(() => null),
}));
vi.mock("@/components/pro-gate", () => ({ ProGate: vi.fn(() => null) }));
vi.mock("@/lib/entitlement", () => ({
  useEntitlement: () => ({ entitled: true, loading: false }),
}));
vi.mock("@convex-dev/react-query", () => ({ convexQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => {
  const data = [
    { _id: "photo-a", latitude: 10, longitude: 20, imageUrl: null },
    {
      _id: "photo-b",
      title: "My own title",
      latitude: 11,
      longitude: 21,
      imageUrl: null,
    },
  ];
  return { useQuery: () => ({ data }) };
});
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("expo-router", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("expo-maps", () => {
  const map = ({ markers }: { markers: { id: string; title: string }[] }) => (
    <div>
      {markers.map((marker) => (
        <span key={marker.id}>{marker.title}</span>
      ))}
    </div>
  );
  return { AppleMaps: { View: map }, GoogleMaps: { View: map } };
});

it("refreshes loaded map fallback titles without changing saved titles", async () => {
  const { default: MapScreen } = await import("@/app/(app)/(tabs)/(map)/index");
  render(<MapScreen />);
  expect(screen.getByText("Saved photo")).toBeTruthy();
  changeLanguage("ja-JP");
  expect(screen.queryByText("Saved photo")).toBeNull();
  expect(screen.getByText("My own title")).toBeTruthy();
});

it("keeps long header glyphs inside the available title width", () => {
  render(<AnimatedText text="Long header" width={40} truncate />);
  expect(screen.getByTestId("canvas").textContent).toBe("Lon…");
});
