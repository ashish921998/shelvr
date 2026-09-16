# Shelvr browser extension

Save the page you're reading to Shelvr from the toolbar, a keyboard shortcut, or
the right-click menu. Everything else — fetching the page, writing the title and
description, picking tags, filing it into spaces — is the same backend pipeline
a save from the phone goes through.

A plain Manifest V3 extension: no build step, no dependencies, no bundler. The
files in this directory are the extension. It is deliberately not a pnpm
workspace package, because there is nothing to install or compile.

## How a browser gets access

The extension cannot sign in the way the app does. Convex Auth's Google and
Apple flows need a redirect surface the extension does not have, and the
marketing site has no auth to borrow. So the signed-in app vouches for the
browser instead:

1. In Shelvr: **Profile → Browser extension → Connect a browser**. The app shows
   an eight-character code, good for ten minutes and usable once.
2. In the browser: open the Shelvr popup and type the code.
3. The extension trades the code for a connection token at
   `POST /extension/pair` and keeps it in `chrome.storage.local`.

From then on every request carries `Authorization: Bearer <token>`. The server
stores only a SHA-256 hash of that token, so the value in this browser is the
only copy — a lost token is re-paired, never recovered. Revoke a browser from
the app's list, or from the popup's **Disconnect**; either kills it immediately.

The backend side lives in `apps/native/convex/extension.ts`, its routes in
`apps/native/convex/http.ts`, and the credential helpers in
`apps/native/convex/model/extensionAuth.ts`.

## Loading it while developing

1. Open `chrome://extensions` and turn on **Developer mode**.
2. **Load unpacked**, and pick this directory.
3. Open the popup. To pair against a dev deployment rather than production,
   expand **Advanced** and set the backend to your deployment's `.convex.site`
   origin before entering the code.

The default backend is the production deployment, matching the URL
`apps/native/app.config.js` pins production builds to. `host_permissions` allows
any `https://*.convex.site`, so switching deployments needs no manifest change.

Reload the extension from `chrome://extensions` after editing the service
worker; the popup picks up changes when it is next opened.

## Packaging for the Chrome Web Store

```sh
cd apps/extension
zip -r ../../shelvr-extension.zip . -x '.*' -x '__MACOSX/*'
```

Bump `version` in `manifest.json` first — the Web Store refuses an upload that
does not increase it.

## What it asks for, and why

| Permission               | Why                                                                |
| ------------------------ | ------------------------------------------------------------------ |
| `storage`                | Holds the connection token, the chosen backend, recent saves       |
| `activeTab`              | Reads the current tab's URL and title, only when you invoke a save |
| `contextMenus`           | The "Save this page/link to Shelvr" right-click items              |
| `https://*.convex.site/` | Calls the Shelvr backend                                           |

`activeTab` rather than `tabs` is the reason the extension cannot see your
browsing: the grant arrives when you click the toolbar button, press the
shortcut, or use the context menu, and covers only that tab at that moment. No
content script is injected into any page, and nothing but the URL you chose to
save leaves the browser.

## Files

| File                | Role                                                               |
| ------------------- | ------------------------------------------------------------------ |
| `manifest.json`     | MV3 manifest: permissions, popup, worker, shortcut                 |
| `src/config.js`     | Stored settings, endpoint validation, browser label                |
| `src/api.js`        | The four `/extension` routes, as functions                         |
| `src/background.js` | Service worker: shortcut, context menu, saving, badge              |
| `src/popup.js`      | Popup: pair this browser, or save the page in front of you         |
| `icons/`            | Toolbar and store icons, from `apps/native/assets/shelvr-mark.svg` |

## Feedback the extension gives

The toolbar badge is the confirmation, since a save started from the keyboard
has no window to report into:

- `…` grey — saving
- `✓` green — saved; Shelvr is classifying it now
- `✓` amber — you had already saved this page, so nothing was created
- `!` red — refused; open the popup for the reason

A save started outside the popup leaves its result behind, so opening the popup
afterwards explains what happened.
