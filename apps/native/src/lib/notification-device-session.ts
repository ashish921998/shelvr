import { ConvexError } from "convex/values";
import { widgetClearErrorEvent } from "./widget-clear-error";

function isOwnershipConflict(error: unknown): boolean {
  if (!(error instanceof ConvexError)) return false;
  const data: unknown = error.data;
  return (
    typeof data === "object" &&
    data !== null &&
    "code" in data &&
    data.code === "notification_token_owned_by_another_account"
  );
}

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
  setSaveReminders: (enabled: boolean) => Promise<unknown>;
  signOut: () => Promise<unknown>;
  deleteAccount: () => Promise<unknown>;
  clearWidget: () => Promise<unknown>;
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
  private registrationBlocked = false;

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
    this.registrationBlocked = false;
  }

  stop() {
    this.generation++;
    this.paused = true;
    this.registeredKey = null;
    this.registrationBlocked = false;
  }

  isRegistered() {
    return (
      !this.paused &&
      this.registeredKey !== null &&
      this.registeredKey.endsWith(`\0${this.deps.getLocale?.() ?? ""}`)
    );
  }

  shouldRetryRegistration() {
    return !this.paused && !this.registrationBlocked && !this.isRegistered();
  }

  register(getToken = () => this.deps.getToken(false)): Promise<boolean> {
    const generation = this.generation;
    const current = () =>
      !this.paused &&
      this.operation !== "sign_out" &&
      this.operation !== "delete_account" &&
      generation === this.generation;
    const operation = this.queue
      .then(async () => {
        if (!current()) return false;
        // Foreground callers honor the block. Explicit attempts (including a
        // token rotation) may retry, and their transient failures stay retryable.
        this.registrationBlocked = false;
        const token = await getToken();
        if (!current()) return false;
        if (!token) {
          this.registeredKey = null;
          this.registrationBlocked = false;
          return false;
        }
        const locale = this.deps.getLocale?.();
        const key = `${token}\0${locale ?? ""}`;
        if (key === this.registeredKey) return true;
        // Persist before the server write so a restart can still revoke an accepted token.
        const tokens = await this.store.read();
        if (!tokens.includes(token)) await this.store.write([...tokens, token]);
        if (!current()) return false;
        try {
          if (locale === undefined) await this.deps.saveToken(token);
          else await this.deps.saveToken(token, locale);
        } catch (error) {
          if (current()) this.registrationBlocked = isOwnershipConflict(error);
          throw error;
        }
        if (!current()) return false;
        this.registeredKey = key;
        this.registrationBlocked = false;
        return true;
      })
      .catch((error: unknown) => {
        if (current()) this.registeredKey = null;
        throw error;
      });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  setWeeklyShelf(enabled: boolean) {
    return this.setPreference(enabled, this.deps.setWeeklyShelf);
  }

  setSaveReminders(enabled: boolean) {
    return this.setPreference(enabled, this.deps.setSaveReminders);
  }

  /** Turning a kind on asks for permission first; `false` means it was denied. */
  private setPreference(
    enabled: boolean,
    save: (enabled: boolean) => Promise<unknown>,
  ) {
    return this.runOperation("preferences", async () => {
      if (enabled && !(await this.register(() => this.deps.getToken(true))))
        return false;
      await save(enabled);
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
        // After a successful account deletion the server has already ended the
        // session; clear the local Convex Auth credentials too.
        if (operation === "delete_account") {
          // Server deletion succeeded even if local auth cleanup fails next.
          void this.deps.clearWidget().catch((error) => {
            this.deps.reportError(new Error(widgetClearErrorEvent(error)));
          });
          try {
            await this.deps.signOut();
          } catch (error) {
            // Local sign-out failed, so no unauthenticated auth edge may
            // follow promptly and the identity hook would not fire — clear
            // the PostHog identity here so events stop attributing to the
            // deleted account.
            this.deps.resetAnalytics();
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
