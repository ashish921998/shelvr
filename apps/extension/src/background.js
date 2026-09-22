/**
 * The service worker: the three ways a page gets saved, and the badge that
 * says what happened.
 *
 * All network traffic goes through here rather than the popup, for two
 * reasons. A save started with the keyboard shortcut or the context menu has no
 * popup to run in, and a save started *from* the popup would be cancelled the
 * moment the popup closes — which, for a one-click button, is immediately. The
 * worker outlives both.
 *
 * The worker itself is not durable: Chrome stops it when idle and restarts it
 * on the next event, so nothing is kept in module state. `chrome.storage` is
 * the only memory, and the badge is written as it goes.
 */
import {
  clearConnection,
  MAX_RECENT,
  readSettings,
  STORAGE_KEYS,
  writeSettings,
} from "./config.js";
import {
  disconnectBrowser,
  fetchSession,
  pairBrowser,
  saveLink,
  ShelvrError,
} from "./api.js";

const MENU_PAGE = "shelvr-save-page";
const MENU_LINK = "shelvr-save-link";

/** How long a result sits on the badge before the toolbar goes quiet again. */
const BADGE_MS = 3_000;

const BADGE = {
  working: { text: "…", color: "#8d8271", title: "Saving to Shelvr…" },
  saved: { text: "✓", color: "#3f8f5f", title: "Saved to Shelvr" },
  duplicate: { text: "✓", color: "#e6a23c", title: "Already in Shelvr" },
  failed: { text: "!", color: "#c05a3a", title: "Couldn't save to Shelvr" },
};

chrome.runtime.onInstalled.addListener(() => {
  // Recreated from scratch on every install/update: `create` throws on a
  // duplicate id, and an update that renames a menu would otherwise leave the
  // old one behind.
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: "Save this page to Shelvr",
      contexts: ["page", "selection", "image", "video", "audio"],
    });
    chrome.contextMenus.create({
      id: MENU_LINK,
      title: "Save this link to Shelvr",
      contexts: ["link"],
    });
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  // Right-clicking a link saves the link; right-clicking anything else saves
  // the page it is on.
  const url = info.menuItemId === MENU_LINK ? info.linkUrl : info.pageUrl;
  void saveUrl(url ?? tab?.url);
});

chrome.commands.onCommand.addListener((command) => {
  if (command !== "save-current-page") return;
  void saveActiveTab();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // `sendResponse` is async here, so the listener must return true to keep the
  // message channel open until the promise settles.
  handleMessage(message)
    .then(sendResponse)
    .catch((error) => sendResponse({ ok: false, code: codeOf(error) }));
  return true;
});

async function handleMessage(message) {
  switch (message?.type) {
    case "state": {
      // Opening the popup is the user looking at the result, so the badge has
      // done its job — and this is what clears one left behind by a worker
      // Chrome stopped before its timer fired.
      const state = await readSettings();
      await setBadge(null);
      return { ok: true, state };
    }
    case "pair":
      return await handlePair(message);
    case "save":
      return await saveUrl(message.url);
    case "refresh":
      return await handleRefresh();
    case "disconnect":
      return await handleDisconnect();
    case "clearLastResult":
      await writeSettings({ [STORAGE_KEYS.lastResult]: null });
      return { ok: true };
    default:
      return { ok: false, code: "unknown_message" };
  }
}

async function handlePair({ code, label, endpoint }) {
  try {
    const result = await pairBrowser(endpoint, code, label);
    await writeSettings({
      [STORAGE_KEYS.token]: result.token,
      [STORAGE_KEYS.endpoint]: endpoint,
      [STORAGE_KEYS.account]: { label: result.label },
      [STORAGE_KEYS.recent]: [],
      [STORAGE_KEYS.lastResult]: null,
    });
    // Fills in the account email for the popup header. Cosmetic unless it
    // comes back unauthorized — that means the connection was revoked between
    // pairing and this call, and `handleRefresh` has already dropped the dead
    // token. Reporting success there would bounce the popup back to the
    // pairing form with no explanation.
    const refresh = await handleRefresh();
    if (!refresh.ok && refresh.code === "unauthorized") {
      return refresh;
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, code: codeOf(error) };
  }
}

async function handleRefresh() {
  const { token, endpoint } = await readSettings();
  if (!token) return { ok: false, code: "not_connected" };
  try {
    const session = await fetchSession(endpoint, token);
    await writeSettings({ [STORAGE_KEYS.account]: session });
    return { ok: true, session };
  } catch (error) {
    // The connection was revoked from the app (or the account was deleted).
    // Drop the dead token so the popup returns to the pairing screen instead
    // of failing every save from here on.
    if (error instanceof ShelvrError && error.code === "unauthorized") {
      await clearConnection();
    }
    return { ok: false, code: codeOf(error) };
  }
}

async function handleDisconnect() {
  const { token, endpoint } = await readSettings();
  if (token) {
    try {
      await disconnectBrowser(endpoint, token);
    } catch {
      // Revoking server-side is best effort: the user asked this browser to
      // forget its token, and it must do that whether or not the backend is
      // reachable. A token left alive is revocable from the app.
    }
  }
  await clearConnection();
  await setBadge(null);
  return { ok: true };
}

async function saveActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return await saveUrl(tab?.url);
}

/**
 * Save one URL and leave the outcome where both the badge and the popup can
 * find it.
 *
 * A network failure is retried once under the same operation id, so the retry
 * is free when the first attempt actually landed and its response was the part
 * that got lost. Refusals (no Pro, bad URL, revoked token) are not retried —
 * they will refuse again.
 */
async function saveUrl(url) {
  const { token, endpoint } = await readSettings();
  if (!token) {
    await recordResult({ status: "not_connected" });
    await setBadge(BADGE.failed, "Connect Shelvr to save this page");
    return { ok: false, code: "not_connected" };
  }
  if (typeof url !== "string" || !/^https?:/i.test(url)) {
    // Browser-internal pages (chrome://, about:, the extensions gallery) have
    // nothing to fetch and the backend would refuse them anyway. Say so here
    // rather than spending a round trip on it.
    await recordResult({ status: "error", code: "invalid_url", url });
    await setBadge(BADGE.failed, "This page can't be saved");
    return { ok: false, code: "invalid_url" };
  }

  await setBadge(BADGE.working);
  const operationId = `ext:${crypto.randomUUID()}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await saveLink(endpoint, token, url, operationId);
      const status = result.status === "duplicate" ? "duplicate" : "saved";
      await recordResult({ status, url });
      await rememberRecent({ url, status, at: Date.now() });
      await setBadge(status === "duplicate" ? BADGE.duplicate : BADGE.saved);
      return { ok: true, status };
    } catch (error) {
      const code = codeOf(error);
      if (code === "offline" && attempt === 0) continue;
      if (code === "unauthorized") await clearConnection();
      await recordResult({ status: "error", code, url });
      await setBadge(BADGE.failed, badgeTitleFor(code));
      return { ok: false, code };
    }
  }
  return { ok: false, code: "offline" };
}

function badgeTitleFor(code) {
  switch (code) {
    case "pro_required":
      return "Shelvr Pro is needed to save";
    case "rate_limited":
      return "Too many saves just now — try again shortly";
    case "unauthorized":
      return "This browser is no longer connected";
    case "offline":
      return "Couldn't reach Shelvr";
    case "invalid_url":
      return "This page can't be saved";
    default:
      return BADGE.failed.title;
  }
}

async function recordResult(result) {
  await writeSettings({
    [STORAGE_KEYS.lastResult]: { ...result, at: Date.now() },
  });
}

/** Serializes the recent-saves list against itself. `chrome.storage` has no
 * read-modify-write primitive, so two saves landing together would both read
 * the old list and the second write would drop the first one's entry. The
 * chain resets when Chrome restarts the worker, which is fine: the race only
 * exists between saves that overlap inside one worker's life. */
let recentWrite = Promise.resolve();

function rememberRecent(entry) {
  recentWrite = recentWrite
    .catch(() => {})
    .then(async () => {
      const { recent } = await readSettings();
      const next = [entry, ...recent.filter((item) => item.url !== entry.url)];
      await writeSettings({ [STORAGE_KEYS.recent]: next.slice(0, MAX_RECENT) });
    });
  return recentWrite;
}

/**
 * Paint the badge, then clear it after a beat.
 *
 * The timer is the reason `BADGE_MS` is short: Chrome may stop an idle worker
 * before a long one fires, and a badge that outlives its worker would sit on
 * the toolbar until the next save. A stale badge is also cleared whenever the
 * popup asks for state, so the worst case is visible only until the user looks.
 */
async function setBadge(state, title) {
  if (state === null) {
    await chrome.action.setBadgeText({ text: "" });
    await chrome.action.setTitle({ title: "Save to Shelvr" });
    return;
  }
  await chrome.action.setBadgeBackgroundColor({ color: state.color });
  await chrome.action.setBadgeText({ text: state.text });
  await chrome.action.setTitle({ title: title ?? state.title });
  if (state === BADGE.working) return;
  setTimeout(() => void setBadge(null), BADGE_MS);
}

function codeOf(error) {
  return error instanceof ShelvrError ? error.code : "save_failed";
}
