import { Actor, HttpAgent } from "@icp-sdk/core/agent";
import { IDL } from "@icp-sdk/core/candid";

import { resolvePublicEndpoint } from "./endpoint-policy.ts";
import type { GatewayIdentity } from "./gateway-identity.ts";
import type { LeaseController } from "./lease-controller.ts";
import type { GatewayEvent } from "./types.ts";

interface ClaimChallenge {
  rentalId: bigint;
  gatewayId: string;
  minerId: string;
  expiresAtNs: bigint;
  challenge: string;
}

interface ClaimedLease {
  rentalId: bigint;
  gatewayId: string;
  minerId: string;
  poolEndpoint: string;
  worker: string;
  expiresAtNs: bigint;
  acknowledgementChallenge: string;
}

export interface LeaseAuthority {
  observe(gatewayId: string, minerId: string): Promise<ClaimChallenge | undefined>;
  claim(challenge: ClaimChallenge, signatureBase64: string): Promise<ClaimedLease>;
  acknowledge(lease: ClaimedLease, signatureBase64: string): Promise<void>;
}

export interface LeaseEnforcerStatus {
  mode: "supervised";
  state: "starting" | "idle" | "awaiting-arm" | "activating" | "active" | "error";
  lastCheckedAt?: string;
  rentalId?: string;
  expiresAt?: string;
  error?: string;
}

const idlFactory: IDL.InterfaceFactory = ({ IDL }) => {
  const algorithm = IDL.Variant({ Kheavyhash: IDL.Null });
  const network = IDL.Variant({ Kaspa: IDL.Null });
  const state = IDL.Variant({ Claimed: IDL.Null, Acknowledged: IDL.Null });
  const error = IDL.Variant({
    InvalidGatewayId: IDL.Null,
    InvalidSignature: IDL.Null,
    GatewayNotPaired: IDL.Null,
    MinerNotRegistered: IDL.Null,
    RentalNotFound: IDL.Null,
    RentalNotLive: IDL.Null,
    LeaseAlreadyClaimed: IDL.Null,
    LeaseNotClaimed: IDL.Null,
    LeaseAlreadyAcknowledged: IDL.Null,
  });
  const challenge = IDL.Record({
    rental_id: IDL.Nat64,
    gateway_id: IDL.Text,
    miner_id: IDL.Text,
    expires_at_ns: IDL.Nat64,
    claim_challenge: IDL.Text,
  });
  const claim = IDL.Record({
    rental_id: IDL.Nat64,
    gateway_id: IDL.Text,
    miner_id: IDL.Text,
    algorithm,
    network,
    pool_endpoint: IDL.Text,
    worker: IDL.Text,
    expires_at_ns: IDL.Nat64,
    claim_nonce: IDL.Nat64,
    state,
    acknowledgement_challenge: IDL.Text,
  });
  const acknowledgement = IDL.Record({
    rental_id: IDL.Nat64,
    gateway_id: IDL.Text,
    miner_id: IDL.Text,
    claim_nonce: IDL.Nat64,
    state,
    acknowledged_at_ns: IDL.Nat64,
  });
  return IDL.Service({
    observe_gateway_lease_claim: IDL.Func([IDL.Text, IDL.Text], [IDL.Opt(challenge)], ["query"]),
    claim_gateway_lease: IDL.Func([
      IDL.Record({ rental_id: IDL.Nat64, gateway_id: IDL.Text, signature: IDL.Vec(IDL.Nat8) }),
    ], [IDL.Variant({ Ok: claim, Err: error })], []),
    acknowledge_gateway_lease: IDL.Func([
      IDL.Record({ rental_id: IDL.Nat64, gateway_id: IDL.Text, signature: IDL.Vec(IDL.Nat8) }),
    ], [IDL.Variant({ Ok: acknowledgement, Err: error })], []),
  });
};

interface WireChallenge {
  rental_id: bigint;
  gateway_id: string;
  miner_id: string;
  expires_at_ns: bigint;
  claim_challenge: string;
}

interface WireClaim {
  rental_id: bigint;
  gateway_id: string;
  miner_id: string;
  algorithm: { Kheavyhash: null };
  network: { Kaspa: null };
  pool_endpoint: string;
  worker: string;
  expires_at_ns: bigint;
  acknowledgement_challenge: string;
}

type WireResult<T> = { Ok: T } | { Err: Record<string, null> };

interface LeaseService {
  observe_gateway_lease_claim(gatewayId: string, minerId: string): Promise<[] | [WireChallenge]>;
  claim_gateway_lease(request: {
    rental_id: bigint;
    gateway_id: string;
    signature: Uint8Array;
  }): Promise<WireResult<WireClaim>>;
  acknowledge_gateway_lease(request: {
    rental_id: bigint;
    gateway_id: string;
    signature: Uint8Array;
  }): Promise<WireResult<unknown>>;
}

function rootKey(hex: string | undefined): Uint8Array | undefined {
  return hex ? Uint8Array.from(Buffer.from(hex, "hex")) : undefined;
}

function resultValue<T>(result: WireResult<T>): T {
  if ("Ok" in result) return result.Ok;
  throw new Error(`ICP lease authority rejected the request: ${Object.keys(result.Err)[0] ?? "Unknown"}`);
}

export class IcpLeaseAuthority implements LeaseAuthority {
  private readonly service: LeaseService;

  private constructor(service: LeaseService) {
    this.service = service;
  }

  static async create(options: {
    apiHost: string;
    backendCanisterId: string;
    rootKeyHex?: string;
  }): Promise<IcpLeaseAuthority> {
    const agent = await HttpAgent.create({ host: options.apiHost, rootKey: rootKey(options.rootKeyHex) });
    return new IcpLeaseAuthority(Actor.createActor<LeaseService>(idlFactory, {
      agent,
      canisterId: options.backendCanisterId,
    }));
  }

  async observe(gatewayId: string, minerId: string): Promise<ClaimChallenge | undefined> {
    const [value] = await this.service.observe_gateway_lease_claim(gatewayId, minerId);
    return value ? {
      rentalId: value.rental_id,
      gatewayId: value.gateway_id,
      minerId: value.miner_id,
      expiresAtNs: value.expires_at_ns,
      challenge: value.claim_challenge,
    } : undefined;
  }

  async claim(challenge: ClaimChallenge, signatureBase64: string): Promise<ClaimedLease> {
    const value = resultValue(await this.service.claim_gateway_lease({
      rental_id: challenge.rentalId,
      gateway_id: challenge.gatewayId,
      signature: Uint8Array.from(Buffer.from(signatureBase64, "base64")),
    }));
    if (!("Kheavyhash" in value.algorithm) || !("Kaspa" in value.network)) {
      throw new Error("ICP claimed lease algorithm or network is unsupported");
    }
    return {
      rentalId: value.rental_id,
      gatewayId: value.gateway_id,
      minerId: value.miner_id,
      poolEndpoint: value.pool_endpoint,
      worker: value.worker,
      expiresAtNs: value.expires_at_ns,
      acknowledgementChallenge: value.acknowledgement_challenge,
    };
  }

  async acknowledge(lease: ClaimedLease, signatureBase64: string): Promise<void> {
    resultValue(await this.service.acknowledge_gateway_lease({
      rental_id: lease.rentalId,
      gateway_id: lease.gatewayId,
      signature: Uint8Array.from(Buffer.from(signatureBase64, "base64")),
    }));
  }
}

function splitEndpoint(endpoint: string): { host: string; port: number } {
  const separator = endpoint.lastIndexOf(":");
  const host = endpoint.slice(0, separator).replace(/^\[|\]$/g, "");
  const port = Number(endpoint.slice(separator + 1));
  if (separator < 1 || !host || !Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("Claimed pool endpoint is malformed");
  }
  return { host, port };
}

export class LeaseEnforcer {
  #timer?: NodeJS.Timeout;
  #polling = false;
  #activeRentalId?: bigint;
  #armedRentalId?: bigint;
  #status: LeaseEnforcerStatus = { mode: "supervised", state: "starting" };
  private readonly authority: LeaseAuthority;
  private readonly identity: GatewayIdentity;
  private readonly leases: LeaseController;
  private readonly minerId: string;
  private readonly pollIntervalMs: number;
  private readonly event: (event: GatewayEvent) => void;
  private readonly now: () => Date;
  private readonly resolveEndpoint: (host: string) => Promise<string>;

  constructor(
    authority: LeaseAuthority,
    identity: GatewayIdentity,
    leases: LeaseController,
    minerId: string,
    pollIntervalMs: number,
    event: (event: GatewayEvent) => void,
    now: () => Date = () => new Date(),
    resolveEndpoint: (host: string) => Promise<string> = resolvePublicEndpoint,
  ) {
    this.authority = authority;
    this.identity = identity;
    this.leases = leases;
    this.minerId = minerId;
    this.pollIntervalMs = pollIntervalMs;
    this.event = event;
    this.now = now;
    this.resolveEndpoint = resolveEndpoint;
  }

  status(): LeaseEnforcerStatus {
    return structuredClone(this.#status);
  }

  arm(rentalId: string): void {
    if (!/^[1-9][0-9]*$/.test(rentalId)) throw new Error("A valid observed rental ID is required");
    if (this.#status.state !== "awaiting-arm" || this.#status.rentalId !== rentalId) {
      throw new Error("The rental is not currently awaiting supervised approval");
    }
    this.#armedRentalId = BigInt(rentalId);
  }

  async pollOnce(): Promise<void> {
    if (this.#polling) return;
    this.#polling = true;
    const checkedAt = this.now();
    try {
      const identity = this.identity.view();
      const challenge = await this.authority.observe(identity.gatewayId, this.minerId);
      if (!challenge) {
        if (this.#activeRentalId !== undefined) {
          await this.leases.restore("icp-lease-ended");
          this.event({ occurredAt: checkedAt.toISOString(), type: "icp-lease-restored-owner" });
          this.#activeRentalId = undefined;
        }
        this.#status = { mode: "supervised", state: "idle", lastCheckedAt: checkedAt.toISOString() };
        return;
      }
      if (challenge.gatewayId !== identity.gatewayId || challenge.minerId !== this.minerId) {
        throw new Error("ICP lease challenge targets another Gateway or miner");
      }
      const expiresAt = new Date(Number(challenge.expiresAtNs / 1_000_000n));
      if (expiresAt.getTime() - checkedAt.getTime() < 30_000) {
        throw new Error("ICP lease has less than 30 seconds remaining");
      }
      if (this.#activeRentalId === challenge.rentalId && this.leases.status().routeId === "renter") {
        this.#status = {
          mode: "supervised",
          state: "active",
          lastCheckedAt: checkedAt.toISOString(),
          rentalId: challenge.rentalId.toString(),
          expiresAt: expiresAt.toISOString(),
        };
        return;
      }
      if (this.#armedRentalId !== challenge.rentalId) {
        this.#armedRentalId = undefined;
        this.#status = {
          mode: "supervised",
          state: "awaiting-arm",
          lastCheckedAt: checkedAt.toISOString(),
          rentalId: challenge.rentalId.toString(),
          expiresAt: expiresAt.toISOString(),
        };
        return;
      }

      this.#status = {
        mode: "supervised",
        state: "activating",
        lastCheckedAt: checkedAt.toISOString(),
        rentalId: challenge.rentalId.toString(),
        expiresAt: expiresAt.toISOString(),
      };
      const claimSignature = this.identity.signLeaseClaimChallenge(challenge.challenge);
      const claimed = await this.authority.claim(challenge, claimSignature);
      if (
        claimed.rentalId !== challenge.rentalId
        || claimed.gatewayId !== identity.gatewayId
        || claimed.minerId !== this.minerId
        || claimed.expiresAtNs !== challenge.expiresAtNs
      ) {
        throw new Error("Claimed lease does not match the signed challenge");
      }
      if (!challenge.challenge.split("\n").includes(`pool_endpoint=${claimed.poolEndpoint}`)) {
        throw new Error("Claimed pool endpoint does not match the signed challenge");
      }
      if (
        claimed.worker.length < 10
        || claimed.worker.length > 200
        || /[\u0000-\u001f\u007f]/.test(claimed.worker)
      ) {
        throw new Error("Claimed renter worker is malformed");
      }
      const endpoint = splitEndpoint(claimed.poolEndpoint);
      const resolvedAddress = await this.resolveEndpoint(endpoint.host);
      await this.leases.activateUntil({
        id: "renter",
        host: resolvedAddress,
        port: endpoint.port,
        publicOnly: true,
        credentials: { username: claimed.worker, password: "x" },
      }, expiresAt, checkedAt);

      try {
        const acknowledgementSignature = this.identity.signLeaseAcknowledgementChallenge(
          claimed.acknowledgementChallenge,
        );
        await this.authority.acknowledge(claimed, acknowledgementSignature);
      } catch (error) {
        await this.leases.restore("icp-lease-acknowledgement-failed");
        throw error;
      }
      this.#activeRentalId = claimed.rentalId;
      this.#armedRentalId = undefined;
      this.#status = {
        mode: "supervised",
        state: "active",
        lastCheckedAt: checkedAt.toISOString(),
        rentalId: claimed.rentalId.toString(),
        expiresAt: expiresAt.toISOString(),
      };
      this.event({
        occurredAt: checkedAt.toISOString(),
        type: "icp-lease-activated-and-acknowledged",
        routeId: "renter",
        detail: `rental=${claimed.rentalId};expires=${expiresAt.toISOString()}`,
      });
    } catch (error) {
      this.#armedRentalId = undefined;
      const message = error instanceof Error ? error.message : "ICP lease enforcement failed";
      this.#status = {
        mode: "supervised",
        state: "error",
        lastCheckedAt: checkedAt.toISOString(),
        error: message,
      };
      this.event({ occurredAt: checkedAt.toISOString(), type: "icp-lease-enforcement-error", detail: message });
    } finally {
      this.#polling = false;
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
