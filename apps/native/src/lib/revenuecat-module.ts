import { NativeModules } from "react-native";

// ---------------------------------------------------------------------------
// Lazy module loaders — the native modules may not be linked in Expo Go or a
// dev build without `expo prebuild`. We check NativeModules first so require()
// never runs (and the dev error overlay never fires) when the native side is
// missing.
// ---------------------------------------------------------------------------

/**
 * Builds a lazy accessor for a native module: returns the module's default
 * export once it's been confirmed linked (via one of `nativeNames` on
 * NativeModules). Failed loads can be retried. The `require` lives in a
 * static thunk so Metro can statically discover and bundle it.
 */
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
