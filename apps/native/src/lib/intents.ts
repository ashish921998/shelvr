// SDK 57's top-level createEventInCalendarAsync is a throwing deprecation stub;
// the working "present the system Add-Event sheet" helper lives in /legacy.
import { createEventInCalendarAsync } from "expo-calendar/legacy";
import * as Clipboard from "expo-clipboard";
import { haptics } from "@/lib/haptics";
import * as Linking from "expo-linking";
import { Platform } from "react-native";
import { openLink } from "@/lib/open-link";
import type { IntentKind } from "@convex/model/itemFields";

export type { IntentKind };

export async function runIntent(
  kind: IntentKind,
  value: string,
): Promise<void> {
  switch (kind) {
    case "open_url":
      await openLink(value);
      break;
    case "copy":
      await Clipboard.setStringAsync(value);
      await haptics.success();
      break;
    case "web_search":
      await openLink(
        `https://www.google.com/search?q=${encodeURIComponent(value)}`,
      );
      break;
    case "open_maps":
      await Linking.openURL(
        Platform.OS === "ios"
          ? `https://maps.apple.com/?q=${encodeURIComponent(value)}`
          : `geo:0,0?q=${encodeURIComponent(value)}`,
      );
      break;
    case "call":
      await Linking.openURL(`tel:${value.replace(/[^\d+]/g, "")}`);
      break;
    case "message":
      await Linking.openURL(`sms:${value.replace(/[^\d+]/g, "")}`);
      break;
    case "email":
      await Linking.openURL(`mailto:${value}`);
      break;
    case "add_event":
      await createEventInCalendarAsync({ title: value });
      break;
  }
}
