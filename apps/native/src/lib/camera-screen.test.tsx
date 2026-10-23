// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import CameraScreen from "@/app/(app)/camera";

type PressableProps = {
  children?: ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  accessibilityRole?: string;
  accessibilityLabel?: string;
  accessibilityState?: { disabled?: boolean; busy?: boolean };
};

vi.mock("react-native", () => ({
  Alert: { alert: vi.fn() },
  View: vi.fn(({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )),
  Text: vi.fn(({ children }: { children?: ReactNode }) => (
    <span>{children}</span>
  )),
  Pressable: vi.fn(
    ({
      children,
      onPress,
      disabled,
      accessibilityRole,
      accessibilityLabel,
      accessibilityState,
    }: PressableProps) => (
      <div
        role={accessibilityRole}
        aria-label={accessibilityLabel}
        aria-disabled={accessibilityState?.disabled}
        aria-busy={accessibilityState?.busy}
        data-disabled={disabled}
        onClick={onPress}
      >
        {children}
      </div>
    ),
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
}));
vi.mock("react-native-reanimated", () => ({
  default: {
    Text: vi.fn(({ children }: { children?: ReactNode }) => children),
  },
  interpolateColor: () => "",
  useAnimatedStyle: () => ({}),
  useSharedValue: (value: number) => ({ value }),
  withTiming: (value: number) => value,
}));
vi.mock("react-native-gesture-handler", () => {
  const pan = { activeOffsetX: () => pan, onEnd: () => pan };
  return {
    Gesture: { Pan: vi.fn(() => pan) },
    GestureDetector: vi.fn(({ children }: { children: ReactNode }) => children),
  };
});
vi.mock("react-native-worklets", () => ({ scheduleOnRN: vi.fn() }));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0 }),
}));
vi.mock("react-native-vision-camera", () => ({
  Camera: vi.fn(() => <div>viewfinder</div>),
  useCameraDevice: () => ({ id: "back" }),
  useCameraPermission: () => ({
    hasPermission: true,
    requestPermission: vi.fn(),
  }),
  usePhotoOutput: () => ({ capturePhotoToFile: vi.fn() }),
}));
vi.mock("subject-lift", () => ({ isAvailable: false, liftSubject: vi.fn() }));
vi.mock("expo-haptics", () => ({}));
vi.mock("expo-status-bar", () => ({ StatusBar: vi.fn(() => null) }));
vi.mock("expo-router", () => ({
  useFocusEffect: vi.fn(),
  useLocalSearchParams: () => ({}),
  useRouter: () => ({ back: vi.fn() }),
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => {},
  localizeError: (_message: string, key: string) => key,
}));
vi.mock("@/lib/pick-and-save-images", () => ({ pickAndSaveImages: vi.fn() }));
vi.mock("@/lib/use-save-image", () => ({
  useSaveImages: () => vi.fn(),
  reportSaveFailures: vi.fn(),
}));
vi.mock("@/lib/use-save-image-batch", () => ({
  useSaveImageBatch: () => vi.fn(),
}));
vi.mock("@/lib/entitlement", () => ({ openPaywall: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: vi.fn() } }));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: vi.fn(() => null) }));
vi.mock("@/components/ui/stitch-loader", () => ({
  StitchRing: vi.fn(() => null),
}));

afterEach(cleanup);

it("names every icon-only control for VoiceOver", () => {
  render(<CameraScreen />);
  for (const label of [
    "common.close",
    "capture.flipCamera",
    "capture.photos",
    "capture.takePhoto",
  ]) {
    expect(screen.getByRole("button", { name: label })).toBeTruthy();
  }
});
