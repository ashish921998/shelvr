/**
 * The toolbar popup: pair this browser, or save the page in front of you.
 *
 * It owns no logic of its own. Every action is a message to the service worker
 * (`background.js`), which holds the token and does the talking — a save must
 * outlive this window, and this window closes the instant the button is
 * clicked. What is left here is reading the current tab and painting state.
 */
import {
  DEFAULT_ENDPOINT,
  describeBrowser,
  normalizeEndpoint,
} from "./config.js";

const els = {
  account: document.getElementById("account"),
  connect: document.getElementById("connect"),
  pairForm: document.getElementById("pair-form"),
  pairSubmit: document.getElementById("pair-submit"),
  code: document.getElementById("code"),
  pairStatus: document.getElementById("pair-status"),
  endpoint: document.getElementById("endpoint"),
  save: document.getElementById("save"),
  pageTitle: document.getElementById("page-title"),
  pageUrl: document.getElementById("page-url"),
  saveButton: document.getElementById("save-button"),
  saveStatus: document.getElementById("save-status"),
  recent: document.getElementById("recent"),
  recentList: document.getElementById("recent-list"),
  shortcut: document.getElementById("shortcut"),
  disconnect: document.getElementById("disconnect"),
};

/** The page this popup was opened over. Read once: the popup cannot outlive
 * a tab change. */
let currentTab = null;

function send(message) {
  return chrome.runtime.sendMessage(message);
}

/** Copy for every failure code the backend and worker can produce. The server
 * never supplies a sentence, so this is the single place a user-visible
 * explanation exists. */
function errorText(code) {
  switch (code) {
    case "invalid_code":
      return "That code didn't work. Codes expire after 10 minutes — try a fresh one.";
    case "rate_limited":
      return "Too many attempts just now. Try again in a minute.";
    case "pro_required":
      return "Saving needs an active Shelvr trial or subscription.";
    case "unauthorized":
      return "This browser is no longer connected. Pair it again.";
    case "invalid_url":
      return "This page can't be saved.";
    case "offline":
      return "Couldn't reach Shelvr. Check your connection.";
    case "not_connected":
      return "Connect this browser first.";
    default:
      return "Something went wrong. Try again.";
  }
}

function setStatus(element, text, tone = "") {
  element.textContent = text;
  element.className = tone ? `status is-${tone}` : "status";
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// --- pairing ---------------------------------------------------------------

/** Type the code the way it is displayed: uppercase, with the dash inserted
 * after the fourth character so the field mirrors the app's `XXXX-XXXX`. */
els.code.addEventListener("input", () => {
  const raw = els.code.value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .slice(0, 8);
  els.code.value = raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
});

els.pairForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const endpoint = normalizeEndpoint(els.endpoint.value);
  if (endpoint === null) {
    setStatus(els.pairStatus, "That isn't a Shelvr backend address.", "error");
    return;
  }
  const code = els.code.value.replace(/[^0-9A-Z]/gi, "");
  if (code.length !== 8) {
    setStatus(els.pairStatus, "Enter the 8-character code.", "error");
    return;
  }

  els.pairSubmit.disabled = true;
  setStatus(els.pairStatus, "Connecting…");
  const result = await send({
    type: "pair",
    code,
    endpoint,
    label: describeBrowser(),
  });
  els.pairSubmit.disabled = false;
  if (!result?.ok) {
    setStatus(els.pairStatus, errorText(result?.code), "error");
    return;
  }
  els.code.value = "";
  setStatus(els.pairStatus, "");
  await render();
});

// --- saving ----------------------------------------------------------------

els.saveButton.addEventListener("click", async () => {
  els.saveButton.disabled = true;
  setStatus(els.saveStatus, "Saving…");
  const result = await send({ type: "save", url: currentTab?.url });
  els.saveButton.disabled = false;
  if (!result?.ok) {
    setStatus(els.saveStatus, errorText(result?.code), "error");
    // A revoked token drops the popup back to the pairing screen.
    if (result?.code === "unauthorized") await render();
    return;
  }
  setStatus(
    els.saveStatus,
    result.status === "duplicate"
      ? "Already in your Shelvr."
      : "Saved. Shelvr is filing it now.",
    "success",
  );
  await render({ keepStatus: true });
});

els.disconnect.addEventListener("click", async () => {
  els.disconnect.disabled = true;
  await send({ type: "disconnect" });
  els.disconnect.disabled = false;
  await render();
});

// --- painting --------------------------------------------------------------

function renderRecent(recent) {
  els.recentList.replaceChildren(
    ...recent.map((entry) => {
      const item = document.createElement("li");
      const dot = document.createElement("span");
      dot.className =
        entry.status === "duplicate" ? "recent-dot is-duplicate" : "recent-dot";
      dot.textContent = "•";
      const host = document.createElement("span");
      host.className = "recent-host";
      // textContent, never innerHTML: the host comes from a page the user
      // visited, and this popup is an extension-privileged document.
      host.textContent = hostOf(entry.url);
      host.title = entry.url;
      item.append(dot, host);
      return item;
    }),
  );
  els.recent.hidden = recent.length === 0;
}

/** Show what a keyboard-started save did, once. Saves from the shortcut or the
 * context menu have no window to report into, so the worker leaves the result
 * behind and the next popup reads it. */
async function renderLastResult(lastResult) {
  if (!lastResult) return;
  if (lastResult.status === "error") {
    setStatus(els.saveStatus, errorText(lastResult.code), "error");
  } else if (lastResult.status === "duplicate") {
    setStatus(els.saveStatus, "Already in your Shelvr.", "success");
  } else if (lastResult.status === "saved") {
    setStatus(els.saveStatus, "Saved. Shelvr is filing it now.", "success");
  }
  await send({ type: "clearLastResult" });
}

async function renderShortcut() {
  const commands = await chrome.commands.getAll();
  const shortcut = commands.find(
    (c) => c.name === "save-current-page",
  )?.shortcut;
  els.shortcut.textContent = shortcut ? `Shortcut: ${shortcut}` : "";
}

async function render({ keepStatus = false } = {}) {
  const response = await send({ type: "state" });
  const state = response?.state ?? {};
  const connected = Boolean(state.token);

  els.connect.hidden = connected;
  els.save.hidden = !connected;
  els.endpoint.value = state.endpoint ?? DEFAULT_ENDPOINT;

  if (!connected) {
    els.account.hidden = true;
    els.code.focus();
    return;
  }

  els.account.hidden = !state.account?.email;
  els.account.textContent = state.account?.email ?? "";
  els.account.title = state.account?.label ?? "";

  els.pageTitle.textContent = currentTab?.title ?? "This page";
  els.pageUrl.textContent = currentTab?.url ? hostOf(currentTab.url) : "";
  // chrome:// pages, the Web Store and the like have nothing to fetch.
  const savable = /^https?:/i.test(currentTab?.url ?? "");
  els.saveButton.disabled = !savable;
  if (!savable && !keepStatus) {
    setStatus(els.saveStatus, "This page can't be saved.");
  }

  renderRecent(state.recent ?? []);
  if (!keepStatus) await renderLastResult(state.lastResult);
}

async function init() {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await render();
  await renderShortcut();
  // Confirms the token still works and refreshes the account line. Runs after
  // the first paint so a slow network never holds the popup blank.
  const refreshed = await send({ type: "refresh" });
  if (!refreshed?.ok && refreshed?.code === "unauthorized") await render();
}

void init();
