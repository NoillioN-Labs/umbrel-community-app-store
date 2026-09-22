import type { GatewayRoute } from "./types.ts";

export interface GatewayConfig {
  stratumHost: string;
  stratumPort: number;
  controlHost: string;
  controlPort: number;
  controlToken: string;
  gatewayIdentityPath: string;
  ownerRoute: GatewayRoute;
  renterRoute: GatewayRoute;
  icpObserver?: {
    apiHost: string;
    backendCanisterId: string;
    minerId: string;
    pollIntervalMs: number;
    rootKeyHex?: string;
  };
}

function port(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error(`${name} must be a valid TCP port`);
  }
  return parsed;
}

function required(value: string | undefined, name: string): string {
  if (!value?.trim()) throw new Error(`${name} is required`);
  return value.trim();
}

function enabled(value: string | undefined): boolean {
  return value?.toLowerCase() === "true";
}

function milliseconds(value: string | undefined, fallback: number, name: string): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 5_000 || parsed > 300_000) {
    throw new Error(`${name} must be an integer between 5000 and 300000`);
  }
  return parsed;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const controlToken = required(env.CONTROL_TOKEN, "CONTROL_TOKEN");
  if (controlToken.length < 24) {
    throw new Error("CONTROL_TOKEN must contain at least 24 characters");
  }

  const observeIcp = enabled(env.ICP_LEASE_OBSERVER_ENABLED);
  const apiHost = env.ICP_API_HOST?.trim();
  const rootKeyHex = env.ICP_ROOT_KEY_HEX?.trim();
  if (observeIcp && apiHost?.startsWith("http://") && !rootKeyHex) {
    throw new Error("ICP_ROOT_KEY_HEX is required for a non-TLS local ICP API host");
  }
  if (rootKeyHex && !/^[0-9a-f]{266}$/i.test(rootKeyHex)) {
    throw new Error("ICP_ROOT_KEY_HEX must be a 133-byte hexadecimal root key");
  }

  return {
    stratumHost: env.STRATUM_LISTEN_HOST ?? "0.0.0.0",
    stratumPort: port(env.STRATUM_LISTEN_PORT, 5557, "STRATUM_LISTEN_PORT"),
    controlHost: env.CONTROL_LISTEN_HOST ?? "127.0.0.1",
    controlPort: port(env.CONTROL_LISTEN_PORT, 5558, "CONTROL_LISTEN_PORT"),
    controlToken,
    gatewayIdentityPath: env.GATEWAY_IDENTITY_PATH?.trim() || "/data/gateway-identity.json",
    ownerRoute: {
      id: "owner",
      host: env.OWNER_UPSTREAM_HOST ?? "127.0.0.1",
      port: port(env.OWNER_UPSTREAM_PORT, 5556, "OWNER_UPSTREAM_PORT"),
      publicOnly: false,
    },
    renterRoute: {
      id: "renter",
      host: required(env.RENTER_UPSTREAM_HOST, "RENTER_UPSTREAM_HOST"),
      port: port(env.RENTER_UPSTREAM_PORT, 1208, "RENTER_UPSTREAM_PORT"),
      publicOnly: true,
    },
    icpObserver: observeIcp
      ? {
          apiHost: required(apiHost, "ICP_API_HOST"),
          backendCanisterId: required(env.ICP_BACKEND_CANISTER_ID, "ICP_BACKEND_CANISTER_ID"),
          minerId: env.ICP_MINER_ID?.trim() || "ks7-lite-01",
          pollIntervalMs: milliseconds(env.ICP_POLL_INTERVAL_MS, 10_000, "ICP_POLL_INTERVAL_MS"),
          rootKeyHex,
        }
      : undefined,
  };
}
