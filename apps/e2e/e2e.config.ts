import { google } from "@ai-sdk/google";
import { mobile } from "@e2e-dev/mobile";
import { mobileTools } from "@e2e-dev/mobile/tools";
import type { E2EConfig } from "e2e";

// A port of its own, so the suite never loads another checkout's bundle from
// a Metro that happens to be running on 8081.
const metroPort = process.env.E2E_METRO_PORT ?? "8091";
const metroUrl = `http://localhost:${metroPort}`;

const ios = mobile({ platform: "ios", device: process.env.E2E_DEVICE });

export default {
  targets: [
    {
      name: "ios",
      engine: ios,
      app: {
        bundleId: "app.shelvr.save.dev",
        // Skip the dev launcher and keep the dev menu from covering the app.
        launchArguments: [
          "--initialUrl",
          metroUrl,
          "-EXDevMenuShowsAtLaunch",
          "NO",
          "-EXDevMenuIsOnboardingFinished",
          "YES",
          "-EXDevMenuShowFloatingActionButton",
          "NO",
        ],
        command: {
          executable: "pnpm",
          args: ["exec", "expo", "start", "--dev-client", "--port", metroPort],
          cwd: "../native",
          startupTimeout: 120_000,
          log: ".e2e/metro.log",
        },
        readyUrl: `${metroUrl}/status`,
      },
    },
  ],
  workers: 1,
  timeout: 300_000,
  agents: {
    default: {
      model: google(process.env.E2E_MODEL ?? "gemini-3.8-flash"),
      tools: mobileTools(ios),
    },
  },
} satisfies E2EConfig;
