// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useState, type ReactNode } from "react";
import { AnimatedText } from "./animated-text";
import { Button } from "./ui/button";
import { Pressable } from "react-native";
import { TidyDone } from "./tidy/tidy-done";
import { SetupStep } from "@/components/onboarding/setup";
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
    useWindowDimensions: () => ({ fontScale: 1, width: 390, height: 844 }),
    StyleSheet: { flatten },
  };
});
const mockTheme = vi.hoisted(() => ({
  fonts: { regular: "r", medium: "m", bold: "b", display: "d" },
  gap: (v: number) => v * 8,
  radius: { sm: 8, md: 11, lg: 16, xl: 24, full: 9999 },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
    huge: 48,
  },
  // Any variant a component asks for resolves to an empty style.
  type: new Proxy({}, { get: () => ({}) }) as Record<string, object>,
  opacity: { pressed: 0.7, disabled: 0.4 },
  control: { minHeight: 48, pressRetentionOffset: 12 },
  colors: {
    background: "white",
    surface: "white",
    surfaceMuted: "white",
    foreground: "black",
    muted: "gray",
    faint: "gray",
    primary: "orange",
    primaryForeground: "black",
    primarySoft: "white",
    primaryText: "black",
    border: "gray",
    imageBorder: "gray",
    danger: "red",
    overlay: "black",
    onTint: "black",
    onOverlay: "white",
    keep: "green",
    onKeep: "darkgreen",
    tabTint: "orange",
  },
}));

vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({ theme: mockTheme }),
  StyleSheet: {
    // Evaluate style factories with the mock theme so dynamic variant
    // styles (styles.text(variant)) keep working.
    create: (factory: (theme: typeof mockTheme) => unknown) =>
      typeof factory === "function" ? factory(mockTheme) : factory,
    absoluteFillObject: {},
  },
}));
vi.mock("react-native-reanimated", async () => {
  const { useRef } = await import("react");
  const { Text, View } = await import("react-native");
  const transition = {
    duration: () => transition,
    delay: () => transition,
    easing: () => transition,
    reduceMotion: () => transition,
  };
  return {
    default: {
      View,
      Text,
      createAnimatedComponent: (component: unknown) => component,
    },
    FadeIn: transition,
    FadeInDown: transition,
    FadeOut: transition,
    Easing: { bezier: () => ({}), linear: () => ({}) },
    cubicBezier: () => ({}),
    ReduceMotion: { System: "system", Never: "never", Always: "always" },
    useReducedMotion: () => false,
    cancelAnimation: () => undefined,
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

it("preserves caller accessibility state alongside loading and disabled state", () => {
  const { rerender } = render(
    <Button
      title="Continue"
      loading
      accessibilityState={{ selected: true, busy: false, disabled: false }}
    />,
  );
  expect(
    screen.getByRole("button", { name: "Continue" }).hasAttribute("disabled"),
  ).toBe(true);
  expect(
    vi.mocked(Pressable).mock.calls.at(-1)?.[0].accessibilityState,
  ).toEqual({ selected: true, busy: true, disabled: true });
  rerender(<Button title="Continue" accessibilityState={{ selected: true }} />);
  expect(
    vi.mocked(Pressable).mock.calls.at(-1)?.[0].accessibilityState,
  ).toEqual({ selected: true, busy: false, disabled: false });
});
