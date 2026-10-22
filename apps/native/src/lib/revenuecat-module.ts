import { NativeModules } from "react-native";

function makeLazyModule<T>(
  nativeNames: string[],
  load: () => { default: T },
): () => T | null {
  let cached: T | null | undefined;
  return () => {
    if (cached !== undefined) return cached;
    const linked = nativeNames.some(
      (n) => NativeModules[n as keyof typeof NativeModules],
    );
    if (!linked) {
      return null;
    }
    try {
      cached = load().default;
    } catch {
      return null;
    }
    return cached;
  };
}

export const getPurchases = makeLazyModule<
  typeof import("react-native-purchases").default
>(
  ["RNPurchases", "RNPurchasesModule"],
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require("react-native-purchases"),
);

export const getRCUI = makeLazyModule<
  typeof import("react-native-purchases-ui").default
>(
  // react-native-purchases-ui registers its native module as `RNPaywalls`
  // (plural). The older `RNPaywall` (singular) name is retained as a fallback
  // for any older linking variant.
  ["RNPaywalls", "RNPaywall", "RNRevenueCatUI", "RCPurchasesUiModule"],
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  () => require("react-native-purchases-ui"),
);
