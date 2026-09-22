export function widgetClearErrorEvent(error: unknown): string {
  return error instanceof Error &&
    error.message === "widget_thumbnail_cleanup_failed"
    ? "widget_thumbnail_cleanup_failed"
    : "widget_clear_failed";
}
