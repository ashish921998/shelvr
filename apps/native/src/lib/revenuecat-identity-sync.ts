type IdentitySyncOptions = {
  sync: () => Promise<void>;
  onReady: () => void;
  onError: (error: unknown) => void;
};

export function startRevenueCatIdentitySync(options: IdentitySyncOptions) {
  let disposed = false;
  let running = false;
  let ready = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function run() {
    if (disposed || running || ready) return;
    running = true;
    try {
      await options.sync();
      if (disposed) return;
      ready = true;
      options.onReady();
    } catch (error) {
      if (disposed) return;
      failures += 1;
      options.onError(error);
      if (failures < 3) timer = setTimeout(() => void run(), failures * 2000);
    } finally {
      running = false;
    }
  }

  void run();
  return {
    retry() {
      if (disposed || running || ready) return;
      clearTimeout(timer);
      failures = 0;
      void run();
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
