// Unistyles config MUST run before expo-router boots the app — otherwise
// components' StyleSheet.create calls execute before StyleSheet.configure,
// adaptive theming never arms (hasAdaptiveThemes stays false), and freshly
// mounted screens intermittently paint in the default (light) theme.
import "./src/unistyles";
// Foreground notification presentation is process-level too; register it
// before the router boots instead of as a hidden side effect of whatever
// imports lib/notifications first.
import "./src/boot/notifications";
import "expo-router/entry";
