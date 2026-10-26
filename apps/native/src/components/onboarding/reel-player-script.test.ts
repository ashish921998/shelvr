// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REEL_PLAYER_SCRIPT } from "./reel-player-script";

const posted: string[] = [];
let play: () => Promise<void>;

beforeEach(() => {
  posted.length = 0;
  play = () => Promise.resolve();
  Object.assign(window, {
    ReactNativeWebView: {
      postMessage: (message: string) => posted.push(message),
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => play());
});
afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** Loads `html` as the embed page and runs the exact text the web view injects. */
async function run(html: string) {
  document.body.innerHTML = html;
  // Indirect eval runs the injected program itself, at global scope like the web view.
  expect((0, eval)(REEL_PLAYER_SCRIPT)).toBe(true);
  await Promise.resolve();
  return document.querySelector("video");
}

const MP4 = "https://scontent.cdninstagram.com/v/reel.mp4?a=1&b=2";

describe("REEL_PLAYER_SCRIPT", () => {
  it("reads a plain JSON address, with its slashes and ampersands escaped", async () => {
    const video = await run(
      String.raw`<script>{"video_url":"https:\/\/scontent.cdninstagram.com\/v\/reel.mp4?a=1&b=2"}</script>`,
    );
    expect(video?.src).toBe(MP4);
    expect(video?.muted).toBe(true);
    expect(posted).toEqual([]);
  });

  it("reads an address inside an escaped JSON string", async () => {
    const video = await run(
      String.raw`<script>"{\"video_url\":\"https:\\\/\\\/scontent.cdninstagram.com\\\/v\\\/reel.mp4?a=1\\u0026b=2\"}"</script>`,
    );
    expect(video?.src).toBe(MP4);
  });

  it("says missing when the page has no video address", async () => {
    const video = await run("<p>This reel isn't available</p>");
    expect(video).toBeNull();
    expect(posted).toEqual(["missing"]);
  });

  it("says playing once frames are on screen", async () => {
    const video = await run(`<script>{"video_url":"${MP4}"}</script>`);
    video!.dispatchEvent(new Event("playing"));
    video!.dispatchEvent(new Event("playing"));
    expect(posted).toEqual(["playing"]);
  });

  it("says failed once when play is refused or the video errors", async () => {
    play = () => Promise.reject(new Error("NotAllowedError"));
    const video = await run(`<script>{"video_url":"${MP4}"}</script>`);
    await Promise.resolve();
    video!.dispatchEvent(new Event("error"));
    expect(posted).toEqual(["failed"]);
  });

  it("ignores a late error once the video has played", async () => {
    const video = await run(`<script>{"video_url":"${MP4}"}</script>`);
    video!.dispatchEvent(new Event("playing"));
    video!.dispatchEvent(new Event("error"));
    expect(posted).toEqual(["playing"]);
  });
});
