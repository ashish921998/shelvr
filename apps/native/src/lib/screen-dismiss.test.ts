import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { backOrHome, closeScreen, type ClosingScreen } from "./screen-dismiss";

type Listener = (e: { data?: { closing?: boolean } }) => void;

function fakeScreen() {
  const listeners = new Set<Listener>();
  const screen: ClosingScreen = {
    addListener: (_type, callback) => {
      listeners.add(callback);
      return () => listeners.delete(callback);
    },
  };
  const emit = (closing: boolean) =>
    [...listeners].forEach((listener) => listener({ data: { closing } }));
  return { screen, emit, listeners };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

it("waits for the closing transition, however long the sheet takes", async () => {
  const { screen, emit, listeners } = fakeScreen();
  const close = vi.fn();
  const resolved = vi.fn();
  void closeScreen(screen, close).then(resolved);

  expect(close).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1500);
  expect(resolved).not.toHaveBeenCalled();

  emit(true);
  await vi.advanceTimersByTimeAsync(100);
  expect(resolved).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(0);
});

it("ignores an opening transition", async () => {
  const { screen, emit } = fakeScreen();
  const resolved = vi.fn();
  void closeScreen(screen, () => {}).then(resolved);

  emit(false);
  await vi.advanceTimersByTimeAsync(500);
  expect(resolved).not.toHaveBeenCalled();
});

it("gives up when the closing event never comes", async () => {
  const { screen, listeners } = fakeScreen();
  const resolved = vi.fn();
  void closeScreen(screen, () => {}).then(resolved);

  await vi.advanceTimersByTimeAsync(2500);
  expect(resolved).toHaveBeenCalledOnce();
  expect(listeners.size).toBe(0);
});

it("goes back when a screen lies beneath", () => {
  const router = { canGoBack: () => true, back: vi.fn(), replace: vi.fn() };
  backOrHome(router);
  expect(router.back).toHaveBeenCalledOnce();
  expect(router.replace).not.toHaveBeenCalled();
});

it("opens Home when the screen was opened on its own", () => {
  const router = { canGoBack: () => false, back: vi.fn(), replace: vi.fn() };
  backOrHome(router);
  expect(router.back).not.toHaveBeenCalled();
  expect(router.replace).toHaveBeenCalledWith("/(app)/(tabs)/(home)");
});
