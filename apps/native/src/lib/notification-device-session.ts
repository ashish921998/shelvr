type TokenStore = {
  read: () => Promise<string[]>;
  write: (tokens: string[]) => Promise<void>;
};

export class NotificationDeviceSession {
  private generation = 0;
  private paused = true;
  private signingOut = false;
  private queue: Promise<void> = Promise.resolve();
  private registeredToken: string | null = null;

  constructor(private readonly store: TokenStore) {}

  start() {
    this.generation++;
    this.paused = false;
    this.registeredToken = null;
  }

  stop() {
    this.generation++;
    this.paused = true;
    this.registeredToken = null;
  }

  register(
    getToken: () => Promise<string | null>,
    save: (token: string) => Promise<unknown>,
  ): Promise<boolean> {
    const generation = this.generation;
    const current = () =>
      !this.paused && !this.signingOut && generation === this.generation;
    const operation = this.queue.then(async () => {
      if (!current()) return false;
      const token = await getToken();
      if (!token || !current()) return false;
      if (token === this.registeredToken) return true;
      // Persist before the server write so a restart can still revoke an accepted token.
      const tokens = await this.store.read();
      if (!tokens.includes(token)) await this.store.write([...tokens, token]);
      if (!current()) return false;
      await save(token);
      if (!current()) return false;
      this.registeredToken = token;
      return true;
    });
    this.queue = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  async signOut(
    revoke: (token: string) => Promise<unknown>,
    endSession: () => Promise<unknown>,
  ) {
    this.signingOut = true;
    this.stop();
    await this.queue;
    try {
      for (const token of await this.store.read()) await revoke(token);
      await endSession();
      this.stop();
    } catch (error) {
      this.start();
      throw error;
    } finally {
      this.signingOut = false;
    }
  }
}
