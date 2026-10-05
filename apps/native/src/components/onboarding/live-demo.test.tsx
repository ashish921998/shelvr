// @vitest-environment jsdom
// The iOS share step: one Share button, and the paste field tucked behind a
// text link. The save hooks are stubbed, so these tests pin what the step
// itself owns: what is visible, and what each control hands to the hooks.
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Children = { children?: ReactNode };

const mock = vi.hoisted(() => {
  const demo = {
    view: "pick" as string,
    error: null as string | null,
    item: undefined,
    savingUrl: null,
    authUrl: "",
    submitting: false,
    timedOut: false,
    demoUsed: false,
    canSkip: false,
    isAuthenticated: false,
  };
  return {
    demo,
    actions: {
      setError: vi.fn(),
      submitUrl: vi.fn(),
      submitTyped: vi.fn(),
      submitSharedUrl: vi.fn(),
      canAcceptShare: vi.fn(() => true),
      cancelAuth: vi.fn(),
      advance: vi.fn(),
      skip: vi.fn(),
      retry: vi.fn(),
      keepWaiting: vi.fn(),
      continueAfterTimeout: vi.fn(),
    },
    shareSample: vi.fn(),
    nothing: () => null,
    view: ({ children }: Children) => <div>{children}</div>,
    text: ({ children }: Children) => <span>{children}</span>,
    modal: ({ visible, children }: Children & { visible: boolean }) =>
      visible ? <div>{children}</div> : null,
    pressable: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: Children & {
      onPress?: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) => (
      <button
        type="button"
        onClick={onPress}
        disabled={disabled}
        aria-label={accessibilityLabel}
      >
        {children}
      </button>
    ),
    textInput: ({
      value,
      onChangeText,
      accessibilityLabel,
    }: {
      value: string;
      onChangeText: (text: string) => void;
      accessibilityLabel: string;
    }) => (
      <input
        aria-label={accessibilityLabel}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
    ghostButton: ({
      label,
      onPress,
    }: {
      label: string;
      onPress: () => void;
    }) => (
      <button type="button" onClick={onPress}>
        {label}
      </button>
    ),
    reading: () => <div>reading</div>,
  };
});

vi.mock("react-native", () => ({
  Platform: { OS: "ios" },
  View: mock.view,
  Text: mock.text,
  ActivityIndicator: mock.nothing,
  Modal: mock.modal,
  Pressable: mock.pressable,
  TextInput: mock.textInput,
}));
vi.mock("react-native-unistyles", () => {
  const anyStyle = new Proxy({}, { get: () => ({}) });
  return {
    StyleSheet: { create: () => anyStyle },
    useUnistyles: () => ({ theme: new Proxy({}, { get: () => "#000" }) }),
  };
});
vi.mock("expo-image", () => ({ Image: mock.nothing }));
vi.mock("expo-clipboard", () => ({
  isPasteButtonAvailable: false,
  getStringAsync: async () => "",
  ClipboardPasteButton: mock.nothing,
}));
vi.mock("@/components/symbol", () => ({ AppSymbolIcon: mock.nothing }));
vi.mock("@/components/onboarding/parts", () => ({
  GhostButton: mock.ghostButton,
}));
vi.mock("@/components/onboarding/demo-reading-view", () => ({
  DemoLinkRow: mock.nothing,
  DemoReadingView: mock.reading,
}));
vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { capture: vi.fn(), captureError: vi.fn() },
}));
vi.mock("@/lib/anonymous-auth", () => ({
  isAnonymousAuthEnabled: () => false,
}));
vi.mock("@/lib/oauth-sign-in", () => ({
  useOAuthSignIn: () => ({
    signInWith: vi.fn(),
    pendingProvider: null,
    lastError: null,
    interrupted: false,
  }),
}));
vi.mock("@convex/model/itemFields", () => ({ isTerminalFailure: () => false }));
vi.mock("@/lib/use-demo-save", () => ({
  linkFromText: (text: string) => (text.startsWith("http") ? text : null),
  useDemoSave: () => ({ ...mock.demo, ...mock.actions }),
}));
vi.mock("@/lib/use-incoming-share-url", () => ({
  useIncomingShareUrl: () => ({
    shareSheetOpen: false,
    shareSample: mock.shareSample,
  }),
}));

const { LiveDemoStep } = await import("@/components/onboarding/live-demo");
const { DEMO_SAMPLES } = await import("@/lib/onboarding-demo");

const props = {
  samples: [...DEMO_SAMPLES],
  spaces: [],
  resume: null,
  onSaved: vi.fn(),
  onReadingChange: vi.fn(),
  onAdvance: vi.fn(),
};
const step = () => <LiveDemoStep {...props} />;
const pasteLink = () => screen.getByRole("button", { name: "demo.pasteOwn" });
const linkField = () =>
  screen.queryByLabelText("demo.linkLabel") as HTMLInputElement | null;

beforeEach(() => {
  mock.demo.view = "pick";
  mock.demo.error = null;
  mock.demo.demoUsed = false;
  vi.clearAllMocks();
  mock.actions.canAcceptShare.mockReturnValue(true);
});

describe("iOS share step", () => {
  it("shares the featured sample from the one Share button", () => {
    render(step());
    fireEvent.click(screen.getByRole("button", { name: /^demo\.shareThis/ }));
    expect(mock.shareSample).toHaveBeenCalledWith(DEMO_SAMPLES[0].url);
  });

  it("keeps the paste field hidden until its link is tapped", () => {
    render(step());
    expect(linkField()).toBeNull();
    fireEvent.click(pasteLink());
    expect(linkField()).not.toBeNull();
  });

  it("saves a typed link", () => {
    render(step());
    fireEvent.click(pasteLink());
    fireEvent.change(linkField()!, { target: { value: "https://a.test/p" } });
    fireEvent.click(screen.getByRole("button", { name: "demo.save" }));
    expect(mock.actions.submitTyped).toHaveBeenCalledWith("https://a.test/p");
  });

  it("keeps the field and its text after the sign-in sheet is cancelled", () => {
    const { rerender } = render(step());
    fireEvent.click(pasteLink());
    fireEvent.change(linkField()!, { target: { value: "https://a.test/p" } });

    mock.demo.view = "auth";
    rerender(step());
    mock.demo.view = "pick";
    rerender(step());

    expect(linkField()?.value).toBe("https://a.test/p");
    fireEvent.click(screen.getByRole("button", { name: "demo.save" }));
    expect(mock.actions.submitTyped).toHaveBeenCalledWith("https://a.test/p");
  });

  it("clears an old error as soon as the user edits the field", () => {
    mock.demo.error = "demo.shareDismissed";
    render(step());
    fireEvent.click(pasteLink());
    fireEvent.change(linkField()!, { target: { value: "h" } });
    expect(mock.actions.setError).toHaveBeenCalledWith(null);
  });

  it("relabels the Share button, visibly and for screen readers, after a dismissed sheet", () => {
    mock.demo.error = "demo.shareDismissed";
    render(step());
    expect(
      screen.getByRole("button", { name: /^demo\.shareRetry/ }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: /^demo\.shareThis/ }),
    ).toBeNull();
    expect(screen.getByText("demo.shareDismissed")).not.toBeNull();
  });
});
