import { instagramMedia, isTikTokUrl } from "@convex/model/externalUrl";

/**
 * The official embed player for a reel or video post, which plays inside the
 * app: TikTok's player and Instagram's embed page. Undefined when the link
 * names no video the player can load (a TikTok short link, an Instagram share
 * token, or any other site).
 */
export function reelEmbedUrl(url: string | undefined): string | undefined {
  const tiktokId = tiktokVideoId(url);
  if (tiktokId) {
    const params = new URLSearchParams({
      autoplay: "1",
      loop: "1",
      rel: "0",
      music_info: "0",
      description: "0",
      native_context_menu: "0",
    });
    return `https://www.tiktok.com/player/v1/${tiktokId}?${params.toString()}`;
  }
  const media = instagramMedia(url);
  if (media?.shortcode) {
    return `https://www.instagram.com/${media.kind}/${media.shortcode}/embed/`;
  }
  return undefined;
}

/** The numeric id in a full TikTok video link (`/@user/video/{id}`). */
function tiktokVideoId(url: string | undefined): string | undefined {
  if (!isTikTokUrl(url)) return undefined;
  try {
    return new URL(url as string).pathname.match(
      /^\/(?:@[^/]+\/video|v|embed(?:\/v2)?|player\/v1)\/(\d+)(?:[/.]|$)/,
    )?.[1];
  } catch {
    return undefined;
  }
}

/**
 * Whether `url` is a link that redirects to a video the player can load: a
 * TikTok short link (vm.tiktok.com, vt.tiktok.com, tiktok.com/t/) or an
 * Instagram share link.
 */
export function redirectsToReel(url: string | undefined): boolean {
  if (!url || reelEmbedUrl(url)) return false;
  if (isTikTokUrl(url)) return isTikTokShortLink(url);
  return instagramMedia(url) !== undefined;
}

/** vm.tiktok.com/…, vt.tiktok.com/… and tiktok.com/t/…: links that only
 * redirect, unlike a profile or any other TikTok page. */
function isTikTokShortLink(url: string): boolean {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.toLowerCase();
    if (host === "vm.tiktok.com" || host === "vt.tiktok.com") return true;
    return /^\/t\/[A-Za-z0-9_-]+\/?$/.test(pathname);
  } catch {
    return false;
  }
}

/**
 * The embed player for `url`, following a short or share link's redirect when
 * the link itself names no video. Undefined when there is nothing to play, so
 * the caller can open the post instead.
 */
export async function resolveReelEmbedUrl(
  url: string | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<string | undefined> {
  const direct = reelEmbedUrl(url);
  if (direct || !redirectsToReel(url)) return direct;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    // fetch follows the redirect; only where it landed matters, so the body
    // is dropped as soon as the headers arrive.
    const response = await fetchImpl(url as string, {
      signal: controller.signal,
    });
    controller.abort();
    return reelEmbedUrl(response.url);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs inside the embed player. Tells the app once the page has loaded (and
 * starts its video if it sits paused), or
 * fails when TikTok's player reports an error (its player API posts
 * onPlayerReady / onError messages to its parent, which is the page itself
 * when it is loaded on its own). Also sends any link tap (the creator, "watch on Instagram") to the app, which
 * opens the post in its browser: the player is too small to browse in, and an
 * iOS web view drops links that ask for a new window.
 */
export const REEL_PLAYER_SCRIPT = `(function () {
  function send(type) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: type }));
    }
  }
  document.addEventListener(
    "click",
    function (event) {
      var target = event.target;
      var link = target && target.closest ? target.closest("a[href]") : null;
      if (!link) return;
      event.preventDefault();
      event.stopPropagation();
      send("open");
    },
    true
  );
  window.addEventListener("message", function (event) {
    var data = event.data;
    if (typeof data === "string") {
      try { data = JSON.parse(data); } catch (e) { return; }
    }
    if (!data || data["x-tiktok-player"] !== true) return;
    if (data.type === "onPlayerReady") send("ready");
    else if (data.type === "onError") send("error");
  });
  // The user already tapped play in the app, so start a video the page
  // left paused: play its <video> once there is one, else press the page's
  // own play button (Instagram's embed builds the video on that press).
  // Tried for a few seconds, then left to the user.
  function autoplay(triesLeft) {
    var video = document.querySelector("video");
    if (video && !video.paused) return;
    if (video && video.play) {
      var started = video.play();
      if (started && started.catch) started.catch(function () {});
    } else {
      var button = document.querySelector(
        '[aria-label="Play"], [aria-label="play"], [class*="PlayButton"], [class*="playButton"], [class*="Play"]'
      );
      if (button && !(button.closest && button.closest("a[href]"))) {
        button.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true })
        );
      }
    }
    if (triesLeft > 0) {
      setTimeout(function () { autoplay(triesLeft - 1); }, 500);
    }
  }
  function ready() {
    send("ready");
    autoplay(6);
  }
  if (document.readyState === "complete") ready();
  else window.addEventListener("load", ready);
})();
true;`;

type ReelPlayerMessage = "ready" | "open" | "error";

/** The player's message, or undefined for anything else the page posts. */
export function readReelPlayerMessage(
  data: string,
): ReelPlayerMessage | undefined {
  try {
    const type = (JSON.parse(data) as { type?: unknown }).type;
    return type === "ready" || type === "open" || type === "error"
      ? type
      : undefined;
  } catch {
    return undefined;
  }
}
