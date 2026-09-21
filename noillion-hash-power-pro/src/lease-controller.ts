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

  status(): { routeId: GatewayRoute["id"]; expiresAt?: string } {
    return this.#expiresAt
      ? { routeId: "renter", expiresAt: this.#expiresAt }
      : { routeId: "owner" };
  }

  async activate(renterRoute: GatewayRoute, durationSeconds: number, now = new Date()): Promise<string> {
    if (renterRoute.id !== "renter" || !renterRoute.credentials?.username) {
      throw new Error("A renter route with credentials is required");
    }
    if (!Number.isInteger(durationSeconds) || durationSeconds < 30 || durationSeconds > 86_400) {
      throw new Error("durationSeconds must be an integer between 30 and 86400");
    }
    await this.restore("superseded-lease");
    this.#expiresAt = new Date(now.getTime() + durationSeconds * 1000).toISOString();
    await this.switcher.switchRoute(renterRoute, "lease-activated");
    this.#timer = this.scheduler.setTimeout(() => {
      void this.restore("lease-expired");
    }, durationSeconds * 1000);
    return this.#expiresAt;
  }

  async restore(reason = "owner-emergency-stop"): Promise<void> {
    if (this.#timer !== undefined) this.scheduler.clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#expiresAt = undefined;
    await this.switcher.switchRoute(this.ownerRoute, reason);
  }
}
