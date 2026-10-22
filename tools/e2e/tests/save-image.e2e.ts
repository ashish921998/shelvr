import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { beforeEach, test } from "@e2e-dev/mobile";
import { expect } from "e2e";

import { chooseAddOption, startOnSeededHome } from "./seeded-home.ts";

beforeEach(() => {
  execFileSync("xcrun", [
    "simctl",
    "addmedia",
    process.env.E2E_DEVICE ?? "booted",
    fileURLToPath(new URL("../fixtures/photo.png", import.meta.url)),
  ]);
});

startOnSeededHome();

const PICKER_SCREEN = { width: 402, height: 874 };
const PICKER_FIRST_PHOTO = { x: 66, y: 251 };
const PICKER_CONFIRM = { x: 364, y: 144 };

test("saves a photo from the library", async ({ agent, screen }) => {
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
