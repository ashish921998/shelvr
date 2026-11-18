import { Fragment, type ReactNode } from "react";
import { vi } from "vitest";

type Box = { children?: ReactNode };

function View({ children }: Box) {
  return <div>{children}</div>;
}

function Text({ children }: Box) {
  return <span>{children}</span>;
}

function ActivityIndicator() {
  return <progress />;
}

function Pressable({
  children,
  onPress,
  disabled,
  accessibilityLabel,
}: Box & {
  onPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <button
      aria-label={accessibilityLabel}
      disabled={disabled}
      onClick={onPress}
    >
      {children}
    </button>
  );
}

function TextInput({
  accessibilityLabel,
  testID,
  value,
  onChangeText,
}: {
  accessibilityLabel?: string;
  testID?: string;
  value?: string;
  onChangeText?: (text: string) => void;
}) {
  return (
    <input
      aria-label={accessibilityLabel}
      data-testid={testID}
      value={value}
      onChange={(event) => onChangeText?.(event.target.value)}
    />
  );
}

function FlatList({
  data,
  renderItem,
  ListEmptyComponent: empty,
}: {
  data: unknown[];
  renderItem: (row: { item: unknown; index: number }) => ReactNode;
  ListEmptyComponent?: ReactNode;
}) {
  return (
    <div>
      {data.length === 0
        ? empty
        : data.map((item, index) => (
            <Fragment key={index}>{renderItem({ item, index })}</Fragment>
          ))}
    </div>
  );
}

export const reactNative = {
  Platform: { OS: "ios", Version: "18.0" },
  Alert: { alert: vi.fn() },
  Keyboard: { dismiss: vi.fn() },
  Linking: { openURL: vi.fn() },
  I18nManager: { isRTL: false },
  Share: { share: vi.fn(), dismissedAction: "dismissedAction" },
  useWindowDimensions: () => ({ width: 402, height: 800 }),
  View,
  ScrollView: View,
  Modal: View,
  Text,
  ActivityIndicator,
  Pressable,
  TextInput,
  FlatList,
};

const anyStyle = () => new Proxy({}, { get: () => ({}) });

export const unistyles = {
  StyleSheet: { create: anyStyle, absoluteFillObject: {}, hairlineWidth: 1 },
  useUnistyles: () => ({
    theme: {
      colors: new Proxy({}, { get: () => "#000000" }),
      gap: (n: number) => n * 8,
      type: {},
    },
    rt: {
      themeName: "light",
      insets: { top: 0, bottom: 0 },
      screen: { width: 390, height: 800 },
    },
  }),
};
