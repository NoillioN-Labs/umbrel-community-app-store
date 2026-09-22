import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";

import { resolvePublicEndpoint } from "./endpoint-policy.ts";
import type { GatewayEvent, ObservedIcpLease } from "./types.ts";

const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const algorithm = IDL.Variant({ Kheavyhash: IDL.Null });
  const network = IDL.Variant({ Kaspa: IDL.Null });
  const lease = IDL.Record({
    rental_id: IDL.Nat64,
    miner_id: IDL.Text,
    algorithm,
    network,
    pool_endpoint: IDL.Text,
    created_at_ns: IDL.Nat64,
    expires_at_ns: IDL.Nat64,
  });
  return IDL.Service({
    observe_active_test_lease: IDL.Func([IDL.Text], [IDL.Opt(lease)], ["query"]),
  });
};

interface WireLease {
  rental_id: bigint;
  miner_id: string;
  algorithm: { Kheavyhash: null };
  network: { Kaspa: null };
  pool_endpoint: string;
  created_at_ns: bigint;
  expires_at_ns: bigint;
}

interface LeaseService {
  observe_active_test_lease(minerId: string): Promise<[] | [WireLease]>;
}

export interface LeaseObservationReader {
  read(minerId: string): Promise<ObservedIcpLease | undefined>;
}

export interface LeaseObserverStatus {
  mode: "dry-run";
  state: "starting" | "idle" | "lease-observed" | "error";
  lastCheckedAt?: string;
  observedLease?: {
    rentalId: string;
    poolEndpoint: string;
    expiresAt: string;
  };
  error?: string;
}

function rootKey(hex: string | undefined): Uint8Array | undefined {
  if (!hex) return undefined;
  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export class IcpLeaseReader implements LeaseObservationReader {
  private readonly service: LeaseService;

  private constructor(service: LeaseService) {
    this.service = service;
  }

  static async create(options: {
    apiHost: string;
    backendCanisterId: string;
    rootKeyHex?: string;
  }): Promise<IcpLeaseReader> {
    const agent = await HttpAgent.create({
      host: options.apiHost,
      rootKey: rootKey(options.rootKeyHex),
    });
    const service = Actor.createActor<LeaseService>(idlFactory, {
      agent,
      canisterId: options.backendCanisterId,
    });
    return new IcpLeaseReader(service);
  }

  async read(minerId: string): Promise<ObservedIcpLease | undefined> {
    const [lease] = await this.service.observe_active_test_lease(minerId);
    if (!lease) return undefined;
    if (!("Kheavyhash" in lease.algorithm) || !("Kaspa" in lease.network)) {
      throw new Error("ICP lease algorithm or network is unsupported");
    }
    return {
      rentalId: lease.rental_id,
      minerId: lease.miner_id,
      algorithm: "kheavyhash",
      network: "kaspa",
      poolEndpoint: lease.pool_endpoint,
      createdAtNs: lease.created_at_ns,
      expiresAtNs: lease.expires_at_ns,
    };
  }
}

function endpointHost(endpoint: string): string {
  const separator = endpoint.lastIndexOf(":");
  if (separator < 1) throw new Error("Observed pool endpoint is malformed");
  const host = endpoint.slice(0, separator).replace(/^\[|\]$/g, "");
  const port = Number(endpoint.slice(separator + 1));
  if (!host || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Observed pool endpoint is malformed");
  }
  return host;
}

export class LeaseObserver {
  #timer?: NodeJS.Timeout;
  #status: LeaseObserverStatus = { mode: "dry-run", state: "starting" };
  private readonly reader: LeaseObservationReader;
  private readonly minerId: string;
  private readonly pollIntervalMs: number;
  private readonly event: (event: GatewayEvent) => void;
  private readonly now: () => Date;
  private readonly validateHost: (host: string) => Promise<unknown>;

  constructor(
    reader: LeaseObservationReader,
    minerId: string,
    pollIntervalMs: number,
    event: (event: GatewayEvent) => void,
    now: () => Date = () => new Date(),
    validateHost: (host: string) => Promise<unknown> = resolvePublicEndpoint,
  ) {
    this.reader = reader;
    this.minerId = minerId;
    this.pollIntervalMs = pollIntervalMs;
    this.event = event;
    this.now = now;
    this.validateHost = validateHost;
  }

  status(): LeaseObserverStatus {
    return structuredClone(this.#status);
  }

  async pollOnce(): Promise<void> {
    const checkedAt = this.now();
    try {
      const lease = await this.reader.read(this.minerId);
      if (!lease) {
        this.#status = { mode: "dry-run", state: "idle", lastCheckedAt: checkedAt.toISOString() };
        return;
      }
      if (lease.minerId !== this.minerId) throw new Error("Observed lease targets another miner");
      if (lease.expiresAtNs <= BigInt(checkedAt.getTime()) * 1_000_000n) {
        throw new Error("Observed lease is expired");
      }
      await this.validateHost(endpointHost(lease.poolEndpoint));

      const observedLease = {
        rentalId: lease.rentalId.toString(),
        poolEndpoint: lease.poolEndpoint,
        expiresAt: new Date(Number(lease.expiresAtNs / 1_000_000n)).toISOString(),
      };
      const isNew = this.#status.observedLease?.rentalId !== observedLease.rentalId;
      this.#status = {
        mode: "dry-run",
        state: "lease-observed",
        lastCheckedAt: checkedAt.toISOString(),
        observedLease,
      };
      if (isNew) {
        this.event({
          occurredAt: checkedAt.toISOString(),
          type: "icp-lease-observed-dry-run",
          detail: `rental=${observedLease.rentalId};expires=${observedLease.expiresAt}`,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "ICP lease observation failed";
      this.#status = {
        mode: "dry-run",
        state: "error",
        lastCheckedAt: checkedAt.toISOString(),
        error: message,
      };
      this.event({ occurredAt: checkedAt.toISOString(), type: "icp-lease-observer-error", detail: message });
    }
  }

  async start(): Promise<void> {
    await this.pollOnce();
    this.#timer = setInterval(() => void this.pollOnce(), this.pollIntervalMs);
  }

  stop(): void {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
