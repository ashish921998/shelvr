import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { beforeEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { chooseAddOption, startOnSeededHome } from "./seeded-home.ts";

// The suite brings its own photo and checks that it is the one saved, so the
// flow never passes on whatever else is in the simulator's library. Added before the app is
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

// Centres of the picker's first photo and confirm tick, in points, on the
// screen they were measured on.
const PICKER_SCREEN = { width: 402, height: 874 };
const PICKER_FIRST_PHOTO = { x: 66, y: 251 };
const PICKER_CONFIRM = { x: 364, y: 144 };

test("saves a photo from the library", async ({ agent, screen }) => {
  // The system photo picker is outside the accessibility tree the engine
  // reads, so its two controls are tapped by position. Left to find them from
  // a screenshot, the model put the confirm tick about 40 points too low,
  // which is a photo: the run then saved two photos or timed out trying to
  // undo it. The positions are the centres of the picker's own accessibility
  // frames on iOS 26. The newest photo is first in the grid, which is the
  // one just added unless the library holds a photo dated later, so the pick
  // is checked before it is confirmed: confirming uploads the photo, and the
  // flow must not upload anything but its own fixture.
  // They hold for the one screen they were measured on, so any other
  // simulator stops here instead of tapping somewhere unmeasured.
  const tabBar = await screen.getByRole("tablist", "Tab Bar").boundingBox();
  expect(
    tabBar && [tabBar.x + tabBar.width, tabBar.y + tabBar.height],
    "the picker's tap positions are measured for a 402 x 874 point screen (iPhone 17)",
  ).toEqual([PICKER_SCREEN.width, PICKER_SCREEN.height]);
  await chooseAddOption(screen, screen.getByRole("button", /Photos$/));
  await agent.waitFor("the system photo picker is open and shows photos", {
    timeout: 60_000,
    vision: "only",
  });
  await screen.tapAt(PICKER_FIRST_PHOTO);
  await agent.waitFor(
    "the photo picker has exactly one photo selected, and it is the plain orange picture that reads E2E PHOTO",
    { timeout: 30_000, vision: "only" },
  );
  await screen.tapAt(PICKER_CONFIRM);

  await agent.waitFor(
    "Home shows five saves: the four seeded ones and one new photo save whose picture is plain orange and reads E2E PHOTO",
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
