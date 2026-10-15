import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const requirePlugin = createRequire(
  new URL("../../plugins/with-android-accent.js", import.meta.url),
);
const plugin = requirePlugin("./with-android-accent.js");

type ResourceXML = {
  resources: {
    color?: { $: { name: string }; _: string }[];
    style?: {
      $: { name: string; parent: string };
      item: { $: { name: string }; _: string }[];
    }[];
  };
};

type Mod = (mod: { modResults: ResourceXML }) => Promise<{
  modResults: ResourceXML;
}>;

function runMod(name: string, modResults: ResourceXML) {
  const config = plugin({}) as { mods: { android: Record<string, Mod> } };
  return config.mods.android[name]({ modResults });
}

describe("Android accent config plugin", () => {
  it("sets colorAccent for light and night", async () => {
    const light = await runMod("colors", { resources: {} });
    const night = await runMod("colorsNight", { resources: {} });

    expect(light.modResults.resources.color).toContainEqual({
      $: { name: "colorAccent" },
      _: plugin.ACCENT.light,
    });
    expect(night.modResults.resources.color).toContainEqual({
      $: { name: "colorAccent" },
      _: plugin.ACCENT.dark,
    });
  });

  it("points AppTheme at the accent color", async () => {
    const styles = await runMod("styles", {
      resources: {
        style: [
          {
            $: {
              name: "AppTheme",
              parent: "Theme.AppCompat.DayNight.NoActionBar",
            },
            item: [],
          },
        ],
      },
    });

    expect(styles.modResults.resources.style?.[0].item).toContainEqual({
      $: { name: "colorAccent" },
      _: "@color/colorAccent",
    });
  });

  it("matches the theme's amber text colors", () => {
    const theme = readFileSync(
      new URL("../unistyles.ts", import.meta.url),
      "utf8",
    );
    expect(theme).toContain(`primaryText: "${plugin.ACCENT.light}"`);
    expect(theme).toContain(`primaryText: "${plugin.ACCENT.dark}"`);
  });
});
