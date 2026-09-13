type TokenStore = {
  read: () => Promise<string[]>;
  write: (tokens: string[]) => Promise<void>;
};

type SessionDependencies = {
  getToken: (requestPermission: boolean) => Promise<string | null>;
  saveToken: (token: string, locale?: string) => Promise<unknown>;
  getLocale?: () => string;
  revokeToken: (token: string) => Promise<unknown>;
  setWeeklyShelf: (enabled: boolean) => Promise<unknown>;
  signOut: () => Promise<unknown>;
  deleteAccount: () => Promise<unknown>;
  resetAnalytics: () => void;
  reportError: (error: unknown) => void;
};

type NotificationOperation =
  | "idle"
  | "preferences"
  | "sign_out"
  | "delete_account";

export class NotificationDeviceSession {
  private generation = 0;
  private paused = true;
  private operation: NotificationOperation = "idle";
  private listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private registeredKey: string | null = null;

  constructor(
    private readonly store: TokenStore,
    private readonly deps: SessionDependencies,
  ) {}

  getSnapshot = () => this.operation;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setOperation(operation: NotificationOperation) {
    this.operation = operation;
    for (const listener of this.listeners) listener();
  }

  private async runOperation<T>(
    operation: Exclude<NotificationOperation, "idle">,
    action: () => Promise<T>,
  ) {
    if (this.operation !== "idle") return;
    this.setOperation(operation);
    try {
      return await action();
    } finally {
      this.setOperation("idle");
    }
  }

  start() {
    this.generation++;
    this.paused = false;
    this.registeredKey = null;
  }

  stop() {
    this.generation++;
    this.paused = true;
    this.registeredKey = null;
  }

  register(getToken = () => this.deps.getToken(false)): Promise<boolean> {
    const generation = this.generation;
    const current = () =>
      !this.paused &&
      this.operation !== "sign_out" &&
      this.operation !== "delete_account" &&
      generation === this.generation;
    const operation = this.queue.then(async () => {
      if (!current()) return false;
      const token = await getToken();
      if (!token || !current()) return false;
      const locale = this.deps.getLocale?.();
      const key = `${token}\0${locale ?? ""}`;
      if (key === this.registeredKey) return true;
      // Persist before the server write so a restart can still revoke an accepted token.
      const tokens = await this.store.read();
      if (!tokens.includes(token)) await this.store.write([...tokens, token]);
      if (!current()) return false;
      if (locale === undefined) await this.deps.saveToken(token);
      else await this.deps.saveToken(token, locale);
      if (!current()) return false;
      this.registeredKey = key;
      return true;
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  setWeeklyShelf(enabled: boolean) {
    return this.runOperation("preferences", async () => {
      if (enabled && !(await this.register(() => this.deps.getToken(true))))
        return false;
      await this.deps.setWeeklyShelf(enabled);
      return true;
    });
  }

  signOut() {
    return this.endSession("sign_out");
  }

  deleteAccount() {
    return this.endSession("delete_account");
  }

  private async endSession(operation: "sign_out" | "delete_account") {
    try {
      await this.runOperation(operation, async () => {
        this.stop();
        await this.queue;
        try {
          for (const token of await this.store.read())
            await this.deps.revokeToken(token);
          await (operation === "delete_account"
            ? this.deps.deleteAccount()
            : this.deps.signOut());
        } catch (error) {
          this.start();
          throw error;
        }
        this.stop();
        // Once the account is deleted, local cleanup cannot turn it into a failed deletion.
        const cleanup =
          operation === "delete_account"
            ? [this.deps.signOut, this.deps.resetAnalytics]
            : [this.deps.resetAnalytics];
        for (const action of cleanup) {
          try {
            await action();
          } catch (error) {
            this.deps.reportError(error);
          }
        }
      });
    } catch (error) {
      void this.register().catch(this.deps.reportError);
      throw error;
    }
  }
}
