// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { ReactNode } from "react";

vi.mock("@/lib/i18n", () => ({
  t: (key: string) => key,
  useAppLocale: () => "en",
}));
vi.mock("react-native", () => ({
  View: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Text: ({
    children,
    style,
    maxFontSizeMultiplier,
  }: {
    children: ReactNode;
    style: { fontFamily?: string };
    maxFontSizeMultiplier?: number;
  }) => (
    <span data-font={style.fontFamily} data-max-scale={maxFontSizeMultiplier}>
      {children}
    </span>
  ),
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (build: (theme: object) => object) =>
      build({
        fonts: { display: "display", regular: "regular" },
        colors: { foreground: "foreground", muted: "muted" },
        gap: (n: number) => n * 8,
      }),
  },
}));
vi.mock("@/components/onboarding/parts", () => ({
  CtaButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button data-primitive="cta" onClick={onPress}>
      {label}
    </button>
  ),
  GhostButton: ({ label, onPress }: { label: string; onPress: () => void }) => (
    <button data-primitive="ghost" onClick={onPress}>
      {label}
    </button>
  ),
}));

const { SubmissionRecovery } = await import("./submission-recovery");
const { HEADLINE_MAX_SCALE } = await import("@/lib/use-large-text");

it("uses the onboarding headline and enabled primary and quiet actions", () => {
  const onKeepWaiting = vi.fn();
  const onContinue = vi.fn();
  render(
    <SubmissionRecovery
      onKeepWaiting={onKeepWaiting}
      onContinue={onContinue}
    />,
  );
  const title = screen.getByText("demo.submissionTitle");
  expect(title.getAttribute("data-font")).toBe("display");
  expect(title.getAttribute("data-max-scale")).toBe(String(HEADLINE_MAX_SCALE));
  expect(screen.getByText("demo.submissionUnconfirmed")).toBeTruthy();
  const waiting = screen.getByRole("button", { name: "demo.keepWaiting" });
  const continuing = screen.getByRole("button", { name: "common.continue" });
  expect(waiting.getAttribute("data-primitive")).toBe("cta");
  expect(continuing.getAttribute("data-primitive")).toBe("ghost");
  fireEvent.click(waiting);
  fireEvent.click(continuing);
  expect(onKeepWaiting).toHaveBeenCalledOnce();
  expect(onContinue).toHaveBeenCalledOnce();
});
