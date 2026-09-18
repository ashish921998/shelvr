import { useAppLocale } from "@/lib/i18n";
import { AppTabs } from "@/components/ui/app-tab-bar";

// One nav on every platform. iOS used to get the system tab bar, but the
// redesign's bar is a piece of the same paper the shelves sit on and carries
// the hand-redraw tab change, neither of which a native bar can do.
export default function TabsLayout() {
  useAppLocale();
  return <AppTabs />;
}
