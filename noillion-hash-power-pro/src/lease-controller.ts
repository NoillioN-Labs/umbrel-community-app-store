import type { GatewayRoute } from "./types.ts";

export interface RouteSwitcher {
  switchRoute(route: GatewayRoute, reason: string): Promise<void>;
}

interface Scheduler {
  setTimeout(callback: () => void, delayMs: number): unknown;
  clearTimeout(handle: unknown): void;
}

const systemScheduler: Scheduler = {
  setTimeout: (callback, delayMs) => setTimeout(callback, delayMs),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

export class LeaseController {
  #timer?: unknown;
  #expiresAt?: string;
  #lastError?: string;
  private readonly switcher: RouteSwitcher;
  private readonly ownerRoute: GatewayRoute;
  private readonly scheduler: Scheduler;

  constructor(
    switcher: RouteSwitcher,
    ownerRoute: GatewayRoute,
    scheduler: Scheduler = systemScheduler,
  ) {
    this.switcher = switcher;
    this.ownerRoute = ownerRoute;
    this.scheduler = scheduler;
  }

  status(): { routeId: GatewayRoute["id"]; expiresAt?: string; error?: string } {
    return this.#expiresAt
      ? { routeId: "renter", expiresAt: this.#expiresAt, ...(this.#lastError ? { error: this.#lastError } : {}) }
      : { routeId: "owner", ...(this.#lastError ? { error: this.#lastError } : {}) };
  }

  async activate(renterRoute: GatewayRoute, durationSeconds: number, now = new Date()): Promise<string> {
    if (renterRoute.id !== "renter" || !renterRoute.credentials?.username) {
      throw new Error("A renter route with credentials is required");
    }
    if (!Number.isInteger(durationSeconds) || durationSeconds < 30 || durationSeconds > 86_400) {
      throw new Error("durationSeconds must be an integer between 30 and 86400");
    }
    return this.activateUntil(
      renterRoute,
      new Date(now.getTime() + durationSeconds * 1000),
      now,
    );
  }

  async activateUntil(renterRoute: GatewayRoute, expiresAt: Date, now = new Date()): Promise<string> {
    if (renterRoute.id !== "renter" || !renterRoute.credentials?.username) {
      throw new Error("A renter route with credentials is required");
    }
    const durationMs = expiresAt.getTime() - now.getTime();
    if (!Number.isFinite(durationMs) || durationMs < 30_000 || durationMs > 86_400_000) {
      throw new Error("Lease expiry must be between 30 and 86400 seconds in the future");
    }
    await this.restore("superseded-lease");
    const expiresAtIso = expiresAt.toISOString();
    try {
      await this.switcher.switchRoute(renterRoute, "lease-activated");
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : "renter route activation failed";
      try {
        await this.switcher.switchRoute(this.ownerRoute, "lease-activation-failed");
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], "Renter activation and owner restoration both failed");
      }
      throw error;
    }
    this.#expiresAt = expiresAtIso;
    this.#lastError = undefined;
    this.#timer = this.scheduler.setTimeout(() => {
      void this.restore("lease-expired").catch(() => {});
    }, durationMs);
    return this.#expiresAt;
  }

  async restore(reason = "owner-emergency-stop"): Promise<void> {
    if (this.#timer !== undefined) this.scheduler.clearTimeout(this.#timer);
    this.#timer = undefined;
    try {
      await this.switcher.switchRoute(this.ownerRoute, reason);
      this.#expiresAt = undefined;
      this.#lastError = undefined;
    } catch (error) {
      this.#lastError = error instanceof Error ? error.message : "owner route restoration failed";
      throw error;
    }
  }
}
