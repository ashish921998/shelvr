// Covers Superwall sitting beside RevenueCat: purchases go through RevenueCat,
// identity follows RevenueCat's user, and nothing runs outside production or
// on a binary without the native module. Only the module boundaries are faked.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => {
  class Result {
    constructor(
      public type: string,
      public error?: string,
    ) {}
  }
  const shared = {
    identify: vi.fn(async (_: { userId: string }) => {}),
    reset: vi.fn(async () => {}),
    setSubscriptionStatus: vi.fn(async (_: unknown) => {}),
  };
  return {
    variant: "production",
    os: "ios",
    nativeLinked: true,
    captureError: vi.fn(),
    shared,
    configure: vi.fn(async (_: unknown) => ({ shared })),
    listeners: [] as ((info: unknown) => void)[],
    rc: {
      PURCHASES_ERROR_CODE: {
        PURCHASE_CANCELLED_ERROR: "1",
        PAYMENT_PENDING_ERROR: "20",
      },
      PRODUCT_CATEGORY: { SUBSCRIPTION: "SUBSCRIPTION" },
      getProducts: vi.fn(),
      purchaseStoreProduct: vi.fn(),
      purchaseSubscriptionOption: vi.fn(),
      restorePurchases: vi.fn(),
      getCustomerInfo: vi.fn(),
      addCustomerInfoUpdateListener: vi.fn(),
    },
    sdk: {
      default: {} as Record<string, unknown>,
      PurchaseResultPurchased: class extends Result {
        constructor() {
          super("purchased");
        }
      },
      PurchaseResultCancelled: class extends Result {
        constructor() {
          super("cancelled");
        }
      },
      PurchaseResultPending: class extends Result {
        constructor() {
          super("pending");
        }
      },
      PurchaseResultFailed: class extends Result {
        constructor(error: string) {
          super("failed", error);
        }
      },
      RestorationResult: {
        restored: () => ({ result: "restored" }),
        failed: () => ({ result: "failed" }),
      },
      // Mirrors the SDK's PascalCase factory names.
      SubscriptionStatus: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Active: (entitlements: string[]) => ({
          status: "ACTIVE",
          entitlements,
        }),
        // eslint-disable-next-line @typescript-eslint/naming-convention
        Inactive: () => ({ status: "INACTIVE" }),
      },
    },
  };
});

vi.mock("expo-constants", () => ({
  default: {
    get expoConfig() {
      return { extra: { variant: mock.variant } };
    },
  },
}));
vi.mock("expo", () => ({
  requireOptionalNativeModule: () => (mock.nativeLinked ? {} : null),
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return mock.os;
    },
  },
}));
vi.mock("@/lib/analytics", () => ({
  analytics: { captureError: mock.captureError },
}));
vi.mock("@/lib/revenuecat-module", () => ({ getPurchases: () => mock.rc }));
vi.mock("expo-superwall/compat", () => mock.sdk);

type Module = typeof import("./superwall");
type Sdk = Parameters<Module["createRevenueCatPurchaseController"]>[0];
type Rc = Parameters<Module["createRevenueCatPurchaseController"]>[1];

async function load(): Promise<Module> {
  vi.resetModules();
  return import("./superwall");
}

const active = { entitlements: { active: { "Shelvr Pro": {} } } };
const inactive = { entitlements: { active: {} } };

beforeEach(() => {
  mock.variant = "production";
  mock.os = "ios";
  mock.nativeLinked = true;
  mock.captureError.mockReset();
  mock.configure.mockClear();
  mock.shared.identify.mockClear();
  mock.shared.reset.mockClear();
  mock.shared.setSubscriptionStatus.mockClear();
  mock.sdk.default = { configure: mock.configure, shared: mock.shared };
  for (const fn of Object.values(mock.rc)) {
    if (typeof fn === "function") (fn as ReturnType<typeof vi.fn>).mockReset();
  }
  mock.rc.getCustomerInfo.mockResolvedValue(inactive);
});

function controller(mod: Module) {
  return mod.createRevenueCatPurchaseController(
    mock.sdk as unknown as Sdk,
    mock.rc as unknown as Rc,
  );
}

describe("RevenueCat purchase controller", () => {
  it("buys an App Store product through RevenueCat", async () => {
    const mod = await load();
    const product = { identifier: "app.shelvr.save.pro.annual" };
    mock.rc.getProducts.mockResolvedValue([product]);
    mock.rc.purchaseStoreProduct.mockResolvedValue({});
    const result = await controller(mod).purchaseFromAppStore(
      product.identifier,
    );
    expect(mock.rc.purchaseStoreProduct).toHaveBeenCalledWith(product);
    expect(result.type).toBe("purchased");
  });

  it.each([
    [{ userCancelled: true }, "cancelled"],
    [{ code: "1" }, "cancelled"],
    [{ code: "20" }, "pending"],
    [{ code: "2" }, "failed"],
  ])("maps RevenueCat error %o to %s", async (error, type) => {
    const mod = await load();
    mock.rc.getProducts.mockResolvedValue([{ identifier: "p" }]);
    mock.rc.purchaseStoreProduct.mockRejectedValue(error);
    const result = await controller(mod).purchaseFromAppStore("p");
    expect(result.type).toBe(type);
    expect(mock.captureError).toHaveBeenCalledTimes(type === "failed" ? 1 : 0);
  });

  it("fails without buying when the product is unknown", async () => {
    const mod = await load();
    mock.rc.getProducts.mockResolvedValue([]);
    const result = await controller(mod).purchaseFromAppStore("missing");
    expect(result.type).toBe("failed");
    expect(mock.rc.purchaseStoreProduct).not.toHaveBeenCalled();
  });

  it("buys the exact Google Play offer Superwall asked for", async () => {
    const mod = await load();
    const base = { id: "annual", isBasePlan: true };
    const trial = { id: "annual:trial", isBasePlan: false };
    const other = { id: "annual:winback", isBasePlan: false };
    mock.rc.getProducts.mockResolvedValue([
      { subscriptionOptions: [base, other, trial] },
    ]);
    mock.rc.purchaseSubscriptionOption.mockResolvedValue({});
    const result = await controller(mod).purchaseFromGooglePlay(
      "pro",
      "annual",
      "trial",
    );
    expect(mock.rc.getProducts).toHaveBeenCalledWith(["pro"], "SUBSCRIPTION");
    expect(mock.rc.purchaseSubscriptionOption).toHaveBeenCalledWith(trial);
    expect(result.type).toBe("purchased");
  });

  it("buys the base plan, not an offer, when no offer is named", async () => {
    const mod = await load();
    const base = { id: "monthly", isBasePlan: true };
    mock.rc.getProducts.mockResolvedValue([
      {
        subscriptionOptions: [{ id: "monthly:intro", isBasePlan: false }, base],
      },
    ]);
    mock.rc.purchaseSubscriptionOption.mockResolvedValue({});
    await controller(mod).purchaseFromGooglePlay("pro:monthly");
    expect(mock.rc.getProducts).toHaveBeenCalledWith(["pro"], "SUBSCRIPTION");
    expect(mock.rc.purchaseSubscriptionOption).toHaveBeenCalledWith(base);
  });

  it("restores through RevenueCat", async () => {
    const mod = await load();
    mock.rc.restorePurchases.mockResolvedValue(active);
    await expect(controller(mod).restorePurchases()).resolves.toEqual({
      result: "restored",
    });
    mock.rc.restorePurchases.mockRejectedValue(new Error("network"));
    await expect(controller(mod).restorePurchases()).resolves.toEqual({
      result: "failed",
    });
  });
});

describe("Superwall identity", () => {
  it("configures once, identifies the user and mirrors entitlements", async () => {
    const mod = await load();
    mock.rc.getCustomerInfo.mockResolvedValue(active);
    await mod.syncSuperwallUser("user_1");
    await mod.syncSuperwallUser("user_1");
    expect(mock.configure).toHaveBeenCalledTimes(1);
    expect(mock.configure).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "pk_Z4XtXjUCvy8Xw6tyjeGpM" }),
    );
    expect(mock.shared.identify).toHaveBeenCalledTimes(1);
    expect(mock.shared.identify).toHaveBeenCalledWith({ userId: "user_1" });
    expect(mock.shared.setSubscriptionStatus).toHaveBeenLastCalledWith({
      status: "ACTIVE",
      entitlements: ["Shelvr Pro"],
    });

    // Later RevenueCat updates keep the status current.
    const [listener] = mock.rc.addCustomerInfoUpdateListener.mock.calls[0];
    listener(inactive);
    expect(mock.shared.setSubscriptionStatus).toHaveBeenLastCalledWith({
      status: "INACTIVE",
    });
  });

  it("resets before identifying a different account", async () => {
    const mod = await load();
    await mod.syncSuperwallUser("user_1");
    await mod.syncSuperwallUser("user_2");
    expect(mock.shared.reset).toHaveBeenCalledTimes(1);
    expect(mock.shared.identify).toHaveBeenLastCalledWith({ userId: "user_2" });
  });

  it("resets on sign-out only after a user was identified", async () => {
    const mod = await load();
    await mod.resetSuperwallUser();
    expect(mock.shared.reset).not.toHaveBeenCalled();
    await mod.syncSuperwallUser("user_1");
    await mod.resetSuperwallUser();
    expect(mock.shared.reset).toHaveBeenCalledTimes(1);
    expect(mock.shared.setSubscriptionStatus).toHaveBeenLastCalledWith({
      status: "INACTIVE",
    });
  });

  it("uses the Android key on Android", async () => {
    mock.os = "android";
    const mod = await load();
    await mod.syncSuperwallUser("user_1");
    expect(mock.configure).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "pk_aqYuXjC-Wy4zborO4U2RW" }),
    );
  });

  it.each(["development", "preview"])("stays off in %s builds", async (v) => {
    mock.variant = v;
    const mod = await load();
    expect(mod.SUPERWALL_API_KEY).toBeUndefined();
    await mod.syncSuperwallUser("user_1");
    expect(mock.configure).not.toHaveBeenCalled();
  });

  it("stays off on a binary without the native module", async () => {
    mock.nativeLinked = false;
    const mod = await load();
    await mod.syncSuperwallUser("user_1");
    expect(mock.configure).not.toHaveBeenCalled();
    expect(mock.captureError).not.toHaveBeenCalled();
  });

  it("reports a failed configure and retries on the next sync", async () => {
    const mod = await load();
    mock.configure.mockRejectedValueOnce(new Error("offline"));
    await expect(mod.syncSuperwallUser("user_1")).resolves.toBeUndefined();
    expect(mock.captureError).toHaveBeenCalledWith(
      "superwall_identity_sync_failed",
      expect.any(Error),
      { provider: "superwall" },
    );
    await mod.syncSuperwallUser("user_1");
    expect(mock.configure).toHaveBeenCalledTimes(2);
    expect(mock.shared.identify).toHaveBeenCalledWith({ userId: "user_1" });
  });
});
