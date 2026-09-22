import type { GatewayRoute } from "./types.ts";

export function assertOwnerRouteReadiness(
  routeId: GatewayRoute["id"],
  readyMinerConnections: number,
): void {
  if (routeId !== "owner") {
    throw new Error("Miner registration proof requires the owner route");
  }
  if (!Number.isSafeInteger(readyMinerConnections) || readyMinerConnections < 1) {
    throw new Error("Miner registration proof requires a miner connected to the owner upstream");
  }
}
