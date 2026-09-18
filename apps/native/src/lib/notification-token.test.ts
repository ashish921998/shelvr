import { beforeEach, describe, expect, it, vi } from "vitest";
import { getExpoPushToken } from "./notification-token";

const mock = vi.hoisted(() => ({
  platform: { OS: "android" },
  constants: {
    expoConfig: { extra: { eas: { projectId: "project-id" } } },
    easConfig: { projectId: "fallback-project" },
  },
  channel: vi.fn(),
  permission: vi.fn(),
  request: vi.fn(),
  token: vi.fn(),
  capture: vi.fn(),
}));
vi.mock("react-native", () => ({ Platform: mock.platform }));
vi.mock("expo-constants", () => ({ default: mock.constants }));
vi.mock("@/lib/i18n", () => ({ t: (key: string) => key }));
vi.mock("@/lib/analytics", () => ({ analytics: { capture: mock.capture } }));
vi.mock("expo-notifications", () => ({
  AndroidImportance: { DEFAULT: 3 },
  IosAuthorizationStatus: { AUTHORIZED: 2, PROVISIONAL: 3, EPHEMERAL: 4 },
  setNotificationChannelAsync: mock.channel,
  getPermissionsAsync: mock.permission,
  requestPermissionsAsync: mock.request,
  getExpoPushTokenAsync: mock.token,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mock.platform.OS = "android";
  mock.constants.expoConfig.extra.eas.projectId = "project-id";
  mock.constants.easConfig.projectId = "fallback-project";
  mock.permission.mockResolvedValue({ granted: true });
  mock.token.mockResolvedValue({ data: "expo-token" });
});

describe("notification token registration", () => {
  it("creates the Android channel before requesting permission and a token", async () => {
    mock.permission.mockResolvedValue({ granted: false });
    mock.request.mockResolvedValue({ granted: true });
    expect(await getExpoPushToken(true)).toBe("expo-token");
    expect(mock.channel).toHaveBeenCalledWith(
      "weekly-shelf",
      expect.any(Object),
    );
    expect(mock.channel).toHaveBeenCalledBefore(mock.request);
    expect(mock.request).toHaveBeenCalledBefore(mock.token);
  });

  it.each([2, 3, 4])(
    "accepts iOS authorization status %s without prompting",
    async (status) => {
      mock.platform.OS = "ios";
      mock.permission.mockResolvedValue({
        granted: status === 2,
        ios: { status },
      });
      expect(await getExpoPushToken(true)).toBe("expo-token");
      expect(mock.channel).not.toHaveBeenCalled();
      expect(mock.request).not.toHaveBeenCalled();
    },
  );

  it.each(["ios", "android"])(
    "does not prompt on %s startup or register denied permission",
    async (platform) => {
      mock.platform.OS = platform;
      mock.permission.mockResolvedValue({ granted: false, ios: { status: 1 } });
      expect(await getExpoPushToken(false)).toBeNull();
      expect(mock.request).not.toHaveBeenCalled();
      expect(mock.token).not.toHaveBeenCalled();
    },
  );

  it("returns no token when the permission request is denied", async () => {
    mock.permission.mockResolvedValue({ granted: false });
    mock.request.mockResolvedValue({ granted: false });
    expect(await getExpoPushToken(true)).toBeNull();
    expect(mock.token).not.toHaveBeenCalled();
  });

  it("passes rotated native tokens to Expo", async () => {
    const devicePushToken = { type: "android" as const, data: "rotated-token" };
    await getExpoPushToken(false, devicePushToken);
    expect(mock.token).toHaveBeenCalledWith({
      projectId: "project-id",
      devicePushToken,
    });
  });

  it("uses the EAS project fallback and rejects missing project configuration", async () => {
    // Match a manifest without an extra.eas.projectId field.
    Reflect.deleteProperty(mock.constants.expoConfig.extra.eas, "projectId");
    await getExpoPushToken(false);
    expect(mock.token).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "fallback-project" }),
    );
    Reflect.deleteProperty(mock.constants.easConfig, "projectId");
    await expect(getExpoPushToken(false)).rejects.toThrow("Expo project ID");
  });

  it.each(["Firebase is unavailable", "network offline"])(
    "surfaces %s instead of treating it as denied permission",
    async (message) => {
      mock.token.mockRejectedValueOnce(new Error(message));
      await expect(getExpoPushToken(true)).rejects.toThrow(message);
    },
  );
});

describe("notification permission telemetry", () => {
  it("records only the outcome the user was just prompted for", async () => {
    mock.permission.mockResolvedValue({ granted: false });
    mock.request.mockResolvedValue({ granted: true });
    await getExpoPushToken(true);
    expect(mock.capture).toHaveBeenCalledWith(
      "notification_permission_result",
      { outcome: "granted" },
    );
  });

  it("stays silent when an existing grant needs no prompt", async () => {
    mock.permission.mockResolvedValue({ granted: true });
    await getExpoPushToken(true);
    expect(mock.capture).not.toHaveBeenCalled();
  });

  it("records a denial", async () => {
    mock.permission.mockResolvedValue({ granted: false });
    mock.request.mockResolvedValue({ granted: false });
    expect(await getExpoPushToken(true)).toBeNull();
    expect(mock.capture).toHaveBeenCalledWith(
      "notification_permission_result",
      { outcome: "denied" },
    );
  });

  it("separates iOS provisional authorization from a full grant", async () => {
    mock.platform.OS = "ios";
    mock.permission.mockResolvedValue({ granted: false, ios: { status: 1 } });
    mock.request.mockResolvedValue({ granted: false, ios: { status: 3 } });
    expect(await getExpoPushToken(true)).toBe("expo-token");
    expect(mock.capture).toHaveBeenCalledWith(
      "notification_permission_result",
      { outcome: "provisional" },
    );
  });
});
