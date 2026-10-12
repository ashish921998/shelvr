import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { beforeEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { chooseAddOption, startOnSeededHome } from "./seeded-home.ts";

// The suite brings its own photo, so the flow never depends on, or uploads,
// whatever happens to be in the simulator's library. Added before the app is
// set up: a tap sent in the moment after the library changes has gone
// nowhere, and the setup that follows gives the simulator time to settle.
beforeEach(() => {
  execFileSync("xcrun", [
    "simctl",
    "addmedia",
    process.env.E2E_DEVICE ?? "booted",
    fileURLToPath(new URL("../fixtures/photo.png", import.meta.url)),
  ]);
});

startOnSeededHome();

test("saves a photo from the library", async ({ agent, screen }) => {
  // The system photo picker is outside the accessibility tree the engine
  // reads, so its two controls are tapped by position. Left to find them from
  // a screenshot, the model put the confirm tick about 40 points too low,
  // which is a photo: the run then saved two photos or timed out trying to
  // undo it. The positions are the centres of the picker's own accessibility
  // frames on iOS 26, as fractions of the screen. The newest photo, the one
  // just added, is first in the grid.
  // The tab bar spans the bottom edge, so its box gives the screen's size.
  const tabBar = await screen.getByRole("tablist", "Tab Bar").boundingBox();
  if (tabBar === null) throw new Error("Home's tab bar has no frame");
  const width = tabBar.x + tabBar.width;
  const height = tabBar.y + tabBar.height;
  await chooseAddOption(screen, screen.getByRole("button", /Photos$/));
  await agent.waitFor("the system photo picker is open and shows photos", {
    timeout: 60_000,
    vision: "only",
  });
  await screen.tapAt({ x: width * 0.165, y: height * 0.287 });
  await screen.tapAt({ x: width * 0.906, y: height * 0.165 });

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
