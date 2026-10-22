export type ClosingScreen = {
  addListener: (
    type: "transitionEnd",
    callback: (e: { data?: { closing?: boolean } }) => void,
  ) => () => void;
};

const DISMISS_TIMEOUT_MS = 2500;

const AFTER_DISMISS_MS = 100;

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
