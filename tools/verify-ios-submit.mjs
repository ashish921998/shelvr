import { readFileSync } from "node:fs";
import { verifyIosSubmitCredentials } from "./ios-submit-credentials.mjs";

try {
  const { expo } = JSON.parse(
    readFileSync(new URL("../apps/native/app.json", import.meta.url), "utf8"),
  );
  const eas = JSON.parse(
    readFileSync(new URL("../apps/native/eas.json", import.meta.url), "utf8"),
  );
  await verifyIosSubmitCredentials({
    token: process.env.EXPO_TOKEN,
    appId: expo.extra.eas.projectId,
    bundleIdentifier: expo.ios.bundleIdentifier,
    appleTeamId: eas.submit.production.ios.appleTeamId,
  });
} catch {
  // Network/API errors can contain credential material; never echo them.
  process.stderr.write(
    "::error::Unable to confirm an EAS-managed iOS submission key for the production app and Apple team. Check EXPO_TOKEN and configure the key with eas credentials --platform ios (production > App Store Connect > EAS Submit) before retrying.\n",
  );
  process.exitCode = 1;
}
