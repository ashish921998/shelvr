import { test } from "@e2e-dev/mobile";

import { startOnSeededHome } from "./seeded-home.ts";

startOnSeededHome();

test("saves a photo from the library", async ({ agent }) => {
  await agent.act(
    "open Add, choose Photos, pick the first photo in the photo library and confirm so it is saved",
  );

  await agent.waitFor(
    "Home shows five saves: the four seeded ones and one new photo save, with nothing still uploading",
    { timeout: 120_000, vision: "only" },
  );
});
