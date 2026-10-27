import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Whether VoiceOver or TalkBack is running, following the setting while the screen is open. */
export function useScreenReader(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((on) => {
        if (live) setEnabled(on);
      })
      .catch(() => undefined);
    const subscription = AccessibilityInfo.addEventListener(
      "screenReaderChanged",
      setEnabled,
    );
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return enabled;
}
