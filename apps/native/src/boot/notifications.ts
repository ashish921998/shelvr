// Foreground notification presentation is a process-level side effect: it must
// be configured before any notification can surface, so it is imported from
// index.ts alongside the Unistyles config rather than reached incidentally
// through whatever happens to import lib/notifications first.
import * as Notifications from "expo-notifications";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});
