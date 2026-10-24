// Stands in for @revenuecat/purchases-js-hybrid-mappings in iOS and Android
// bundles. react-native-purchases requires that package at load time for its
// browser mode, which runs only in Expo Go, Rork or on the web. Shelvr's
// builds always carry the native RNPurchases module, so the browser SDK
// (about 1 MB of JavaScript) was evaluated at every launch and never called.
function unavailable() {
  throw new Error(
    "RevenueCat browser mode is not bundled in Shelvr's native builds.",
  );
}

module.exports = {
  PurchasesCommon: {
    configure: unavailable,
    getInstance: unavailable,
    isConfigured: () => false,
    setLogLevel: unavailable,
  },
};
