import type { Algorithm, Network, RouteProfile } from "@hash-power-pro/domain";

export interface ShareEvent {
  rentalId?: string;
  minerId: string;
  routeId: string;
  occurredAt: string;
  difficulty: number;
  result: "accepted" | "rejected" | "stale" | "unknown";
}

export interface ProtocolAdapter {
  readonly algorithm: Algorithm;
  readonly supportedNetworks: readonly Network[];
  start(): Promise<void>;
  stop(): Promise<void>;
  validateRoute(route: RouteProfile): Promise<void>;
  activateRoute(route: RouteProfile): Promise<void>;
  disconnectRenterRoute(reason: string): Promise<void>;
}

export {
  classifyKheavyhashSubmitResponse,
  parseKheavyhashSubmitRequest,
  type ShareResult,
} from "./kheavyhash-stratum.ts";

