// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NavThemeProvider } from "./nav-theme";

const mock = vi.hoisted(() => ({
  themeName: "light",
  setBackgroundColorAsync: vi.fn(),
  themeProviderValue: null as unknown,
}));

vi.mock("react-native-unistyles", () => ({
  useUnistyles: () => ({
    theme: {
      colors: {
        background: "#191510",
        foreground: "#f4eddd",
        border: "#332c20",
        primary: "#e6a23c",
      },
    },
    rt: { themeName: mock.themeName },
  }),
}));
vi.mock("@/lib/appearance", () => ({
  isDarkThemeName: (name: string) => name === "dark" || name === "darkNeutral",
}));
vi.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: mock.setBackgroundColorAsync,
}));
vi.mock("expo-router", () => ({
  DarkTheme: { dark: true, colors: {} },
  DefaultTheme: { dark: false, colors: {} },
  ThemeProvider: vi.fn(
    (props: { value: unknown; children: React.ReactNode }) => {
      mock.themeProviderValue = props.value;
      return props.children;
    },
  ),
}));

function navTheme() {
  return mock.themeProviderValue as {
    dark: boolean;
    colors: Record<string, string>;
  };
}

describe("NavThemeProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.themeName = "light";
  });

  it("paints the navigator from the active app theme, not the OS scheme", () => {
    mock.themeName = "dark";
    render(
      <NavThemeProvider>
        <div />
      </NavThemeProvider>,
    );
    expect(navTheme().dark).toBe(true);
    expect(navTheme().colors.background).toBe("#191510");
    expect(navTheme().colors.primary).toBe("#e6a23c");
  });

  it("keeps the navigator light for a light app theme", () => {
    render(
      <NavThemeProvider>
        <div />
      </NavThemeProvider>,
    );
    expect(navTheme().dark).toBe(false);
  });

  it("syncs the native window background to the theme", () => {
    mock.themeName = "dark";
    render(
      <NavThemeProvider>
        <div />
      </NavThemeProvider>,
    );
    expect(mock.setBackgroundColorAsync).toHaveBeenCalledWith("#191510");
  });
});
