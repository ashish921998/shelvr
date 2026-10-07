// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HoldButton } from "./parts";

type PressableProps = {
  children: ReactNode;
  onPressIn: () => void;
  onPressOut: () => void;
  onAccessibilityAction: () => void;
  disabled?: boolean;
};

const mock = vi.hoisted(() => ({
  impact: vi.fn(),
  indicator: () => null,
  text: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  pressable: ({
    children,
    onPressIn,
    onPressOut,
    onAccessibilityAction,
    disabled,
  }: PressableProps) => (
    <div>
      <button
        type="button"
        disabled={disabled}
        onMouseDown={onPressIn}
        onMouseUp={onPressOut}
      >
        {children}
      </button>
      <button type="button" onClick={onAccessibilityAction}>
        activate
      </button>
    </div>
  ),
  // The hold animation; `finish` ends it as if the full hold ran.
  finish: null as null | ((finished: boolean) => void),
}));

vi.mock("expo-haptics", () => ({
  impactAsync: mock.impact,
  ImpactFeedbackStyle: { Light: "light" },
}));
vi.mock("react-native", () => ({
  ActivityIndicator: mock.indicator,
  Text: mock.text,
  Pressable: mock.pressable,
}));
vi.mock("react-native-reanimated", () => ({
  default: { View: mock.indicator },
  Easing: { linear: "linear" },
  useAnimatedStyle: () => ({}),
  useSharedValue: () => ({ set: vi.fn() }),
  withTiming: (
    _to: number,
    _config: unknown,
    done?: (finished: boolean) => void,
  ) => {
    if (done) mock.finish = done;
    return 0;
  },
}));
vi.mock("react-native-worklets", () => ({
  scheduleOnRN: (fn: () => void) => fn(),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: () => ({}),
    absoluteFillObject: {},
  },
  useUnistyles: () => ({ theme: { colors: {} } }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.finish = null;
});

const renderHold = () => {
  const onComplete = vi.fn();
  render(<HoldButton label="Remind me" hint="Hold" onComplete={onComplete} />);
  return onComplete;
};

describe("HoldButton", () => {
  it("agrees only once the hold runs to the end, with a haptic", () => {
    const onComplete = renderHold();
    fireEvent.mouseDown(screen.getByText("Remind me"));
    expect(onComplete).not.toHaveBeenCalled();
    mock.finish?.(true);
    expect(onComplete).toHaveBeenCalledOnce();
    expect(mock.impact).toHaveBeenCalledWith("light");
  });

  it("does nothing when let go early", () => {
    const onComplete = renderHold();
    const button = screen.getByText("Remind me");
    fireEvent.mouseDown(button);
    fireEvent.mouseUp(button);
    mock.finish?.(false);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("assistive tech activates it directly, once", () => {
    const onComplete = renderHold();
    fireEvent.click(screen.getByText("activate"));
    fireEvent.click(screen.getByText("activate"));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
