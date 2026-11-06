// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SampleCityId } from "@/lib/sample-cities";
import { BeenStep } from "./been-step";

const mocks = vi.hoisted(() => ({
  dismiss: vi.fn(),
  onContinue: vi.fn(),
}));

vi.mock("expo-localization", () => ({
  getLocales: () => [{ languageTag: "en-US" }],
  useLocales: () => [{ languageTag: "en-US" }],
}));
vi.mock("react-native", () => ({
  Keyboard: { dismiss: mocks.dismiss },
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
  ScrollView: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  TextInput: vi.fn(
    ({
      value,
      placeholder,
      onChangeText,
    }: {
      value: string;
      placeholder: string;
      onChangeText: (text: string) => void;
    }) => (
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => new Proxy({}, { get: () => ({}) }),
    absoluteFill: {},
    absoluteFillObject: {},
  },
  useUnistyles: () => ({
    theme: { colors: { muted: "gray", faint: "gray", onTint: "ink" } },
  }),
}));
vi.mock("expo-image", () => ({ Image: vi.fn(() => null) }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/lib/haptics", () => ({
  haptics: { selection: vi.fn(async () => {}) },
}));
vi.mock("@/components/onboarding/parts", () => ({
  QuestionTitle: vi.fn(({ title, body }: { title: string; body: string }) => (
    <div>
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  )),
  PillButton: vi.fn(
    ({
      label,
      disabled,
      onPress,
      testID,
    }: {
      label: string;
      disabled: boolean;
      onPress: () => void;
      testID: string;
    }) => (
      <button data-testid={testID} disabled={disabled} onClick={onPress}>
        {label}
      </button>
    ),
  ),
  ScalePressable: vi.fn(
    ({
      children,
      onPress,
      accessibilityLabel,
      accessibilityState,
    }: {
      children?: ReactNode;
      onPress: () => void;
      accessibilityLabel: string;
      accessibilityState: { checked: boolean };
    }) => (
      <button
        type="button"
        role="checkbox"
        aria-checked={accessibilityState.checked}
        aria-label={accessibilityLabel}
        onClick={onPress}
      >
        {children}
      </button>
    ),
  ),
}));

function Step({ start = [] }: { start?: SampleCityId[] }) {
  const [picked, setPicked] = useState<SampleCityId[]>(start);
  return (
    <>
      <BeenStep
        picked={picked}
        onChange={setPicked}
        onContinue={mocks.onContinue}
      />
      <output>{picked.join(",")}</output>
    </>
  );
}

const proceed = () =>
  screen.getByTestId("onboarding-been-continue") as HTMLButtonElement;
const tile = (name: string) => screen.getByRole("checkbox", { name });

beforeEach(() => {
  mocks.dismiss.mockClear();
  mocks.onContinue.mockClear();
});
afterEach(cleanup);

describe("BeenStep", () => {
  it("asks where they have been, and waits for a city before Continue", () => {
    render(<Step />);
    expect(screen.getByText("Where have you been?")).toBeTruthy();
    expect(proceed().disabled).toBe(true);
    fireEvent.click(tile("Lisbon"));
    expect(proceed().disabled).toBe(false);
    fireEvent.click(proceed());
    expect(mocks.onContinue).toHaveBeenCalledOnce();
  });

  it("adds a tapped city and takes it off on a second tap", () => {
    render(<Step start={["madrid"]} />);
    fireEvent.click(tile("Lisbon"));
    expect(screen.getByRole("status").textContent).toBe("madrid,lisbon");
    expect(tile("Lisbon").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(tile("Madrid"));
    expect(screen.getByRole("status").textContent).toBe("lisbon");
    fireEvent.click(tile("Lisbon"));
    expect(screen.getByRole("status").textContent).toBe("");
    expect(proceed().disabled).toBe(true);
  });

  it("closes the keyboard on a tile tap after a search and keeps Continue on", () => {
    render(<Step />);
    fireEvent.change(screen.getByPlaceholderText("Search cities"), {
      target: { value: "lis" },
    });
    fireEvent.click(tile("Lisbon"));
    expect(mocks.dismiss).toHaveBeenCalledOnce();
    expect(proceed().disabled).toBe(false);
  });
});
