// Runs inside Instagram's embed page, which only builds its player on a tap: it reads the reel's video
// address from the page data, plays it muted and full-bleed, and says "playing" once frames are on screen,
// "missing" when the page has no video address, and "failed" (once) when the video cannot play.
// Kept as source text, not a function's toString(): Hermes compiles functions to bytecode and drops their text.
export const REEL_PLAYER_SCRIPT = String.raw`(function () {
  var post = function (message) {
    window.ReactNativeWebView.postMessage(message);
  };
  // The address sits in the page's JSON, sometimes inside an escaped string: video_url\":\"https:\/\/…&…\"
  var found = /video_url\\*"\s*:\s*\\*"(.*?)\\*"/.exec(document.documentElement.innerHTML);
  if (!found) {
    post("missing");
    return;
  }
  var src = found[1].replace(/\\/g, "").replace(/u0026/g, "&");
  var started = false;
  var failed = false;
  var fail = function () {
    if (started || failed) return;
    failed = true;
    post("failed");
  };
  var video = document.createElement("video");
  video.src = src;
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "");
  video.style.cssText = "position:fixed;inset:0;width:100%;height:100%;object-fit:cover;background:#000;z-index:2147483647";
  video.addEventListener("playing", function () {
    started = true;
    post("playing");
  }, { once: true });
  video.addEventListener("error", fail);
  document.body.appendChild(video);
  var playing = video.play();
  if (playing && playing.catch) playing.catch(fail);
})(); true;`;
