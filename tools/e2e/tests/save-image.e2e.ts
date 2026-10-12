import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { beforeEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

// The suite brings its own photo, so the flow never depends on, or uploads,
// whatever happens to be in the simulator's library.
beforeEach(() => {
  execFileSync("xcrun", [
    "simctl",
    "addmedia",
    process.env.E2E_DEVICE ?? "booted",
    fileURLToPath(new URL("../fixtures/photo.png", import.meta.url)),
  ]);
});

test("saves a photo from the library", async ({ agent, screen }) => {
  await agent.act(
    "open Add, choose Photos, pick the plain orange photo that reads E2E PHOTO and confirm so it is saved",
  );

  await agent.waitFor(
    "Home shows five saves: the four seeded ones and one new photo save",
    { timeout: 120_000, vision: "only" },
  );
  // A card is labelled "Still working on it" until processing ends, and a
  // failed photo is labelled with its failure. Neither may remain.
  await expect(screen.getByRole("button", "Still working on it")).toBeHidden({
    timeout: 120_000,
  });
  await expect(
    screen.getByRole(
      "button",
      /^(Couldn't read photo|Photo too large|Photo unavailable)$/,
    ),
  ).toBeHidden();
});
