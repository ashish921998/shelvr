/** The part of a native-stack screen's navigation this module listens on. */
export type ClosingScreen = {
  addListener: (
    type: "transitionEnd",
    callback: (e: { data?: { closing?: boolean } }) => void,
  ) => () => void;
};

/**
 * Upper bound on the wait. Expo SDK 58's form sheet takes over a second to
 * close, so this only caps a lost event; it is not the expected wait.
 */
const DISMISS_TIMEOUT_MS = 2500;

/** UIKit clears its presented controller just after the screen disappears. */
const AFTER_DISMISS_MS = 100;

/**
 * Runs `close`, then resolves once this screen has finished closing: the
 * native stack's closing `transitionEnd`, sent when UIKit's dismissal ends.
 * RevenueCat UI presents from the root view controller and UIKit refuses
 * while a sheet is still dismissing, so a paywall opened from a sheet waits
 * here. A fixed delay guessed the dismissal's length and fell short once SDK
 * 58 slowed the form sheet, leaving the paywall unshown and its latch held.
 */
export function closeScreen(
  screen: ClosingScreen,
  close: () => void,
): Promise<void> {
  return new Promise((resolve) => {
    let off = () => {};
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const done = (delay: number) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      off();
      if (delay > 0) setTimeout(resolve, delay);
      else resolve();
    };
    timeout = setTimeout(() => done(0), DISMISS_TIMEOUT_MS);
    off = screen.addListener("transitionEnd", (e) => {
      if (e.data?.closing) done(AFTER_DISMISS_MS);
    });
    close();
  });
}
