import { requireOptionalNativeModule } from "expo-modules-core";

type RecentSavesWidgetNativeModule = {
  /** file:// URI of the private folder the widget reads thumbnails from. */
  getDirectory(): string;
  /** Stores the snapshot (RecentSavesWidgetProps as JSON) and redraws. */
  setSnapshot(json: string): Promise<void>;
};

/**
 * The Android Recent Saves widget, or null where it is not linked (iOS, and
 * Android builds made before the widget shipped). iOS uses expo-widgets.
 */
export const recentSavesWidget =
  requireOptionalNativeModule<RecentSavesWidgetNativeModule>(
    "RecentSavesWidget",
  );
