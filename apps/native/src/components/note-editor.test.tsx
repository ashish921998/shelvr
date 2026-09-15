// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DetailItem } from "./item-detail";
import { NoteEditor } from "./note-editor";
import { saveError } from "@convex/model/saveErrors";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  paywall: vi.fn(),
  alert: vi.fn(),
  captureError: vi.fn(),
}));
vi.mock("convex/react", () => ({ useMutation: () => mocks.update }));
vi.mock("expo-router", () => ({ useRouter: () => ({}) }));
vi.mock("@/lib/entitlement", () => ({ openPaywall: mocks.paywall }));
vi.mock("@/lib/analytics", () => ({
  analytics: { itemAction: vi.fn(), captureError: mocks.captureError },
}));
vi.mock("@/lib/i18n", () => ({
  useAppLocale: () => {},
  t: (key: string) => key,
}));
vi.mock("react-native-unistyles", () => ({
  StyleSheet: { create: () => ({}) },
  useUnistyles: () => ({ theme: { colors: { muted: "gray" } } }),
}));
vi.mock("react-native", () => ({
  View: vi.fn(({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  )),
  TextInput: vi.fn(
    ({
      value,
      onChangeText,
      accessibilityLabel,
    }: {
      value: string;
      onChangeText: (text: string) => void;
      accessibilityLabel: string;
    }) => (
      <textarea
        aria-label={accessibilityLabel}
        value={value}
        onChange={(event) => onChangeText(event.target.value)}
      />
    ),
  ),
  Alert: { alert: mocks.alert },
}));

const item = {
  _id: "note-1",
  type: "note",
  status: "ready",
  note: "Original",
  title: "AI title",
} as DetailItem;
function edit(text: string) {
  fireEvent.change(screen.getByLabelText("item.noteTextLabel"), {
    target: { value: text },
  });
}
async function pause() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(800);
  });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

it("opens the paywall for the error the current backend actually throws", async () => {
  mocks.update.mockRejectedValue(saveError("pro_required"));
  render(<NoteEditor item={item} />);
  edit("Changed");
  await pause();
  expect(mocks.paywall).toHaveBeenCalledOnce();
  expect(mocks.alert).not.toHaveBeenCalled();
});

it("persists a revert after an earlier overlapping save fails", async () => {
  let rejectFirst!: (reason: Error) => void;
  let resolveSecond!: () => void;
  mocks.update
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectFirst = reject;
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveSecond = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  render(<NoteEditor item={item} />);
  edit("First edit");
  await pause();
  edit("Second edit");
  await pause();
  expect(mocks.update).toHaveBeenCalledTimes(1);
  await act(async () => {
    rejectFirst(new Error("Temporary failure"));
  });
  await act(async () => {
    resolveSecond();
  });
  edit("Original");
  await pause();
  expect(mocks.update).toHaveBeenCalledTimes(3);
  expect(mocks.update).toHaveBeenLastCalledWith({
    id: "note-1",
    text: "Original",
  });
  expect(mocks.captureError).toHaveBeenCalledWith(
    "note_update_failed",
    expect.any(Error),
  );
});

it("preserves fresh server text when the untouched editor subsequently edits only the title", async () => {
  mocks.update.mockResolvedValue(undefined);
  const { rerender } = render(<NoteEditor item={item} />);
  rerender(<NoteEditor item={{ ...item, note: "Fresh server text" }} />);
  fireEvent.change(screen.getByLabelText("item.noteTitleLabel"), {
    target: { value: "New title" },
  });
  await pause();
  expect(mocks.update).toHaveBeenLastCalledWith({
    id: "note-1",
    title: "New title",
  });
  expect(
    (screen.getByLabelText("item.noteTextLabel") as HTMLTextAreaElement).value,
  ).toBe("Fresh server text");
});

it("keeps a dirty body while adopting a title changed on another device", async () => {
  mocks.update.mockResolvedValue(undefined);
  const { rerender } = render(<NoteEditor item={item} />);
  edit("Local draft");
  rerender(
    <NoteEditor
      item={{
        ...item,
        titleSource: "user",
        title: "Remote title",
        note: "Remote body",
      }}
    />,
  );
  expect(
    (screen.getByLabelText("item.noteTextLabel") as HTMLTextAreaElement).value,
  ).toBe("Local draft");
  expect(
    (screen.getByLabelText("item.noteTitleLabel") as HTMLTextAreaElement).value,
  ).toBe("Remote title");
  await pause();
  expect(mocks.update).toHaveBeenLastCalledWith({
    id: "note-1",
    text: "Local draft",
  });
});

it("flushes an edit on leaving before the debounce elapses", async () => {
  mocks.update.mockResolvedValue(undefined);
  const { unmount } = render(<NoteEditor item={item} />);
  edit("Leaving draft");
  await act(async () => {
    unmount();
  });
  expect(mocks.update).toHaveBeenCalledExactlyOnceWith({
    id: "note-1",
    text: "Leaving draft",
  });
});

it("follows remote updates after a successful no-op revert", async () => {
  mocks.update.mockResolvedValue(undefined);
  const { rerender } = render(<NoteEditor item={item} />);
  edit("Temporary draft");
  edit("Original");
  await pause();
  rerender(
    <NoteEditor
      item={{ ...item, note: "Remote edit after acknowledgement" }}
    />,
  );
  expect(
    (screen.getByLabelText("item.noteTextLabel") as HTMLTextAreaElement).value,
  ).toBe("Remote edit after acknowledgement");
});
