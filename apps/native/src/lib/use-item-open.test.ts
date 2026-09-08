import { beforeEach, expect, it, vi } from "vitest";
import { useItemOpen } from "./use-item-open";

const mock = vi.hoisted(() => ({
  focus: undefined as undefined | (() => void | (() => void)),
  listener: undefined as undefined | (() => void),
  appState: { currentState: "active" },
  opened: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("react", () => ({ useCallback: (callback: unknown) => callback }));
vi.mock("expo-router", () => ({ useFocusEffect: (callback: typeof mock.focus) => { mock.focus = callback; } }));
vi.mock("@/lib/analytics", () => ({ analytics: { itemOpened: mock.opened } }));
vi.mock("react-native", () => ({ AppState: Object.assign(mock.appState, {
  addEventListener: (_event: string, listener: () => void) => {
    mock.listener = listener;
    return { remove: mock.remove };
  },
}) }));

beforeEach(() => {
  vi.clearAllMocks();
  mock.appState.currentState = "active";
});

const item = { _id: "item-1", _creationTime: 1000, type: "note", status: "ready" } as const;

it("records once per focus across app state transitions, and records a new focus", () => {
  const markOpened = vi.fn().mockResolvedValue(null);
  useItemOpen(item, "home", markOpened);
  const cleanup = mock.focus?.();
  mock.appState.currentState = "inactive";
  mock.listener?.();
  mock.appState.currentState = "active";
  mock.listener?.();
  expect(mock.opened).toHaveBeenCalledTimes(1);
  expect(markOpened).toHaveBeenCalledTimes(1);
  if (cleanup) cleanup();
  expect(mock.remove).toHaveBeenCalledOnce();
  mock.focus?.();
  expect(markOpened).toHaveBeenCalledTimes(2);
});

it("defers an initial background focus until active, then records only once", () => {
  mock.appState.currentState = "background";
  const markOpened = vi.fn().mockResolvedValue(null);
  useItemOpen(item, "direct", markOpened);
  mock.focus?.();
  expect(markOpened).not.toHaveBeenCalled();
  mock.appState.currentState = "active";
  mock.listener?.();
  mock.listener?.();
  expect(markOpened).toHaveBeenCalledOnce();
});
