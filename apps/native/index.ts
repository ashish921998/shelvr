// Unistyles config MUST run before expo-router boots the app. Otherwise
// components' StyleSheet.create calls execute before StyleSheet.configure,
// adaptive theming never arms (hasAdaptiveThemes stays false), and freshly
// mounted screens intermittently paint in the default (light) theme.
import "./src/unistyles";
// Foreground notification presentation is process-level too; register it
// before the router boots instead of as a hidden side effect of whatever
// imports lib/notifications first.
import "./src/boot/notifications";
// An e2e run keeps the development error banner off the screen
// (src/lib/e2e-log-box.ts).
import "./src/boot/e2e-log-box";
// An e2e run can start as a fresh install, before anything reads the
// session or onboarding state (src/lib/e2e-fresh-install.ts).
import "./src/boot/e2e-fresh-install";
import "expo-router/entry";
