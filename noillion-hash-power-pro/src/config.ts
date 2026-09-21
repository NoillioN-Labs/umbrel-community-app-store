import type { GatewayRoute } from "./types.ts";

export interface GatewayConfig {
  stratumHost: string;
  stratumPort: number;
  controlHost: string;
  controlPort: number;
  controlToken: string;
  ownerRoute: GatewayRoute;
  renterRoute: GatewayRoute;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): GatewayConfig {
  const controlToken = required(env.CONTROL_TOKEN, "CONTROL_TOKEN");
  if (controlToken.length < 24) {
    throw new Error("CONTROL_TOKEN must contain at least 24 characters");
  }

  return {
    stratumHost: env.STRATUM_LISTEN_HOST ?? "0.0.0.0",
    stratumPort: port(env.STRATUM_LISTEN_PORT, 5557, "STRATUM_LISTEN_PORT"),
    controlHost: env.CONTROL_LISTEN_HOST ?? "127.0.0.1",
    controlPort: port(env.CONTROL_LISTEN_PORT, 5558, "CONTROL_LISTEN_PORT"),
    controlToken,
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
  };
}
