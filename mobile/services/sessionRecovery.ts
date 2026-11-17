export interface SessionTokenPair {
  token: string;
  refreshToken: string;
}

export interface SessionRecoveryDependencies {
  readRefreshToken: () => Promise<string | null>;
  requestRefresh: (refreshToken: string) => Promise<SessionTokenPair>;
  persistTokens: (
    tokens: SessionTokenPair,
    expectedAccessToken: string,
    isStillCurrent: () => boolean,
  ) => Promise<void>;
  discardTokens: (tokens: SessionTokenPair) => Promise<void>;
  clearPersistedSession: (
    expectedAccessToken: string | null,
    isStillInvalidated: () => boolean,
  ) => Promise<void>;
  isDefiniteRefreshFailure: (error: unknown) => boolean;
  applySession: (token: string | null) => void;
  notifySession: (token: string | null) => void;
}

export class StaleSessionRecoveryError extends Error {
  constructor() {
    super('Session changed while token recovery was in progress');
    this.name = 'StaleSessionRecoveryError';
  }
}

export class MissingRefreshTokenError extends Error {
  constructor() {
    super('No refresh token is available for this session');
    this.name = 'MissingRefreshTokenError';
  }
}

function responseFrom(error: unknown): { status?: unknown; data?: unknown } | null {
  if (!error || typeof error !== 'object' || !('response' in error)) return null;
  const response = (error as { response?: unknown }).response;
  return response && typeof response === 'object'
    ? response as { status?: unknown; data?: unknown }
    : null;
}

export function getErrorStatus(error: unknown): number | null {
  const status = responseFrom(error)?.status;
  return typeof status === 'number' ? status : null;
}

export function isSessionRejection(error: unknown): boolean {
  const response = responseFrom(error);
  if (!response) return false;
  if (response.status === 401) return true;

  return response.status === 403
    && typeof response.data === 'string'
    && response.data.trim() === 'Forbidden';
}

export class SessionRecoveryCoordinator {
  private generation = 0;
  private initialized = false;
  private currentToken: string | null = null;
  private refreshFlight: { generation: number; promise: Promise<string> } | null = null;

  constructor(private readonly dependencies: SessionRecoveryDependencies) {}

  get token(): string | null {
    return this.currentToken;
  }

  get sessionGeneration(): number {
    return this.generation;
  }

  setSession(token: string | null): void {
    this.generation += 1;
    this.initialized = true;
    this.currentToken = token;
    this.refreshFlight = null;
    this.dependencies.applySession(token);
  }

  hydrateIfUnset(token: string | null): void {
    if (this.initialized || !token) return;
    this.generation += 1;
    this.initialized = true;
    this.currentToken = token;
    this.dependencies.applySession(token);
  }

  async recover(rejectedToken: string | null, requestGeneration?: number): Promise<string> {
    if (!this.initialized && rejectedToken) this.hydrateIfUnset(rejectedToken);

    const expectedGeneration = requestGeneration ?? this.generation;
    if (expectedGeneration !== this.generation) throw new StaleSessionRecoveryError();

    if (this.currentToken && rejectedToken && this.currentToken !== rejectedToken) {
      return this.currentToken;
    }

    if (!this.currentToken || (rejectedToken && this.currentToken !== rejectedToken)) {
      throw new StaleSessionRecoveryError();
    }

    const generation = this.generation;
    if (this.refreshFlight?.generation === generation) return this.refreshFlight.promise;

    const promise = this.performRefresh(generation, this.currentToken);
    this.refreshFlight = { generation, promise };

    try {
      return await promise;
    } finally {
      if (this.refreshFlight?.promise === promise) this.refreshFlight = null;
    }
  }

  async rejectCurrentSession(
    rejectedToken: string | null,
    requestGeneration = this.generation,
  ): Promise<void> {
    if (requestGeneration !== this.generation) return;
    if (!this.currentToken || (rejectedToken && rejectedToken !== this.currentToken)) return;
    await this.invalidate(this.generation, this.currentToken);
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation && this.currentToken !== null;
  }

  private assertCurrent(generation: number): void {
    if (!this.isCurrent(generation)) throw new StaleSessionRecoveryError();
  }

  private async performRefresh(generation: number, expectedAccessToken: string): Promise<string> {
    const refreshToken = await this.dependencies.readRefreshToken();
    this.assertCurrent(generation);

    if (!refreshToken) {
      await this.invalidate(generation, expectedAccessToken);
      throw new MissingRefreshTokenError();
    }

    let tokens: SessionTokenPair;
    try {
      tokens = await this.dependencies.requestRefresh(refreshToken);
    } catch (error) {
      if (!this.isCurrent(generation)) throw new StaleSessionRecoveryError();
      if (this.dependencies.isDefiniteRefreshFailure(error)) {
        await this.invalidate(generation, expectedAccessToken);
      }
      throw error;
    }

    this.assertCurrent(generation);
    await this.dependencies.persistTokens(
      tokens,
      expectedAccessToken,
      () => this.isCurrent(generation) && this.currentToken === expectedAccessToken,
    );

    if (!this.isCurrent(generation)) {
      await this.dependencies.discardTokens(tokens);
      throw new StaleSessionRecoveryError();
    }

    this.currentToken = tokens.token;
    this.dependencies.applySession(tokens.token);
    this.dependencies.notifySession(tokens.token);
    return tokens.token;
  }

  private async invalidate(generation: number, expectedAccessToken: string | null): Promise<void> {
    if (!this.isCurrent(generation)) return;

    const invalidationGeneration = this.generation + 1;
    this.generation = invalidationGeneration;
    this.currentToken = null;
    this.refreshFlight = null;
    this.dependencies.applySession(null);
    this.dependencies.notifySession(null);
    await this.dependencies.clearPersistedSession(
      expectedAccessToken,
      () => this.generation === invalidationGeneration && this.currentToken === null,
    );
  }
}
