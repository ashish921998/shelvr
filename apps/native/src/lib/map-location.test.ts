import { beforeEach, expect, it, vi } from "vitest";
import { reactStandIn as react } from "../test/react-stand-in";
import { useMapLocation } from "./map-location";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  request: vi.fn(),
  captureError: vi.fn(),
  listeners: [] as ((state: string) => void)[],
  remove: vi.fn(),
}));

vi.mock("react", async () => {
  const { reactStandIn } = await import("../test/react-stand-in");
  return reactStandIn;
});
vi.mock("expo-maps", () => ({
  getPermissionsAsync: mocks.get,
  requestPermissionsAsync: mocks.request,
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mocks.captureError },
}));
vi.mock("react-native", () => ({
  AppState: {
    addEventListener: (_event: string, listener: (state: string) => void) => {
      mocks.listeners.push(listener);
      return { remove: mocks.remove };
    },
  },
}));

const denied = { granted: false, canAskAgain: false };
const granted = { granted: true, canAskAgain: true };

beforeEach(() => {
  react.unmount();
  vi.resetAllMocks();
  vi.stubEnv("EXPO_OS", "ios");
  mocks.listeners.length = 0;
  mocks.get.mockResolvedValue(denied);
});

it("refreshes both permission grants and revocations on foreground", async () => {
  mocks.get.mockResolvedValueOnce(denied).mockResolvedValueOnce(granted);
  react.mount(() => useMapLocation(true));
  await vi.waitFor(() => expect(react.rerender()).toBe("denied"));
  mocks.listeners.forEach((listener) => listener("background"));
  expect(mocks.get).toHaveBeenCalledTimes(1);
  mocks.listeners.forEach((listener) => listener("active"));
  await vi.waitFor(() => expect(react.rerender()).toBe("granted"));
  mocks.listeners.forEach((listener) => listener("active"));
  await vi.waitFor(() => expect(react.rerender()).toBe("denied"));
  expect(mocks.request).not.toHaveBeenCalled();
  react.unmount();
  expect(mocks.remove).toHaveBeenCalledOnce();
});

it("requests permission only on the initial opening", async () => {
  mocks.get.mockResolvedValue({ granted: false, canAskAgain: true });
  mocks.request.mockResolvedValue(denied);
  react.mount(() => useMapLocation(true));
  await vi.waitFor(() => expect(react.rerender()).toBe("denied"));
  mocks.listeners.forEach((listener) => listener("active"));
  await vi.waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  expect(mocks.request).toHaveBeenCalledOnce();
});

it("keeps the prompt's answer when the prompt itself refocuses the app", async () => {
  let answer: (permission: typeof granted) => void = () => {};
  mocks.get.mockResolvedValue({ granted: false, canAskAgain: true });
  mocks.request.mockReturnValueOnce(
    new Promise((resolve) => (answer = resolve)),
  );
  react.mount(() => useMapLocation(true));
  await vi.waitFor(() => expect(mocks.request).toHaveBeenCalledOnce());
  mocks.listeners.forEach((listener) => listener("active"));
  answer(granted);
  await vi.waitFor(() => expect(react.rerender()).toBe("granted"));
  expect(mocks.get).toHaveBeenCalledOnce();
});

it("ignores an older permission read that finishes last", async () => {
  let finish: (permission: typeof denied) => void = () => {};
  react.mount(() => useMapLocation(true));
  await vi.waitFor(() => expect(react.rerender()).toBe("denied"));
  mocks.get.mockReturnValueOnce(new Promise((resolve) => (finish = resolve)));
  mocks.get.mockResolvedValueOnce(granted);
  mocks.listeners.forEach((listener) => listener("active"));
  mocks.listeners.forEach((listener) => listener("active"));
  await vi.waitFor(() => expect(react.rerender()).toBe("granted"));
  finish(denied);
  await Promise.resolve();
  expect(react.rerender()).toBe("granted");
});

it("does not ask before Map opens or on Android", () => {
  react.mount(() => useMapLocation(false));
  expect(mocks.get).not.toHaveBeenCalled();
  expect(mocks.listeners).toHaveLength(0);
  react.unmount();
  vi.stubEnv("EXPO_OS", "android");
  expect(react.mount(() => useMapLocation(true))).toBe("denied");
  expect(mocks.get).not.toHaveBeenCalled();
});
