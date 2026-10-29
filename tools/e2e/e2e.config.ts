import { existsSync } from "node:fs";

import { google } from "@ai-sdk/google";
import { mobile } from "@e2e-dev/mobile";
import { mobileTools } from "@e2e-dev/mobile/tools";
import type { E2EConfig } from "e2e";

import {
  BUNDLE_ID,
  LAUNCH_ARGUMENTS,
  METRO_PORT,
  METRO_URL,
} from "./tests/launch.ts";
import { SHEET_TRANSITION_MS } from "./tests/seeded-home.ts";

const localEnvironment = new URL(".env.local", import.meta.url);
if (!process.env.CI && existsSync(localEnvironment)) {
  process.loadEnvFile(localEnvironment);
}

const ios = mobile({
  platform: "ios",
  device: process.env.E2E_DEVICE,
  transition: SHEET_TRANSITION_MS,
});

export default {
  targets: [
    {
      name: "ios",
      engine: ios,
      app: {
        bundleId: BUNDLE_ID,
        launchArguments: LAUNCH_ARGUMENTS,
        command: {
          executable: "pnpm",
          args: ["exec", "expo", "start", "--dev-client", "--port", METRO_PORT],
          cwd: "../../apps/native",
          startupTimeout: 120_000,
          log: ".e2e/metro.log",
        },
        readyUrl: `${METRO_URL}/status`,
      },
    },
  ],
  workers: 1,
  timeout: 300_000,
  actionTimeout: 90_000,
  cleanupTimeout: 90_000,
  agents: {
    default: {
      model: google(process.env.E2E_MODEL ?? "gemini-3.8-flash"),
      tools: mobileTools(ios),
    },
  },
} satisfies E2EConfig;
