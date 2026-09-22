import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign } from "node:crypto";

interface StoredGatewayIdentity {
  version: 1;
  gatewayId: string;
  privateKeyPem: string;
}

export interface GatewayIdentityView {
  gatewayId: string;
  publicKeyBase64: string;
}

const PAIRING_CHALLENGE_PREFIX = "hash-power-pro:gateway-pairing:v1";
const MINER_CHALLENGE_PREFIX = "hash-power-pro:miner-registration:v1";
const ED25519_SPKI_PREFIX_LENGTH = 12;

function publicKeyBytes(privateKeyPem: string): Uint8Array {
  const privateKey = createPrivateKey(privateKeyPem);
  const der = createPublicKey(privateKey).export({ type: "spki", format: "der" });
  if (der.length !== ED25519_SPKI_PREFIX_LENGTH + 32) {
    throw new Error("Gateway identity did not produce a 32-byte Ed25519 public key");
  }
  return der.subarray(ED25519_SPKI_PREFIX_LENGTH);
}

function validatePairingChallenge(challenge: string, gatewayId: string): void {
  if (challenge.length > 512) throw new Error("Pairing challenge is too large");
  const lines = challenge.split("\n");
  if (
    lines.length !== 5
    || lines[0] !== PAIRING_CHALLENGE_PREFIX
    || !/^owner=[a-z0-9-]{5,64}$/.test(lines[1] ?? "")
    || lines[2] !== `gateway=${gatewayId}`
    || !/^nonce=[1-9][0-9]*$/.test(lines[3] ?? "")
    || !/^expires_at_ns=[1-9][0-9]*$/.test(lines[4] ?? "")
  ) {
    throw new Error("Pairing challenge is malformed or targets another Gateway");
  }
}

function validateMinerRegistrationChallenge(challenge: string, gatewayId: string): void {
  if (challenge.length > 1024) throw new Error("Miner registration challenge is too large");
  const lines = challenge.split("\n");
  if (
    lines.length !== 10
    || lines[0] !== MINER_CHALLENGE_PREFIX
    || !/^owner=[a-z0-9-]{5,64}$/.test(lines[1] ?? "")
    || lines[2] !== `gateway=${gatewayId}`
    || lines[3] !== "miner=ks7-lite-01"
    || !/^display_name=[\x20-\x7e]{2,80}$/.test(lines[4] ?? "")
    || lines[5] !== "algorithm=kheavyhash"
    || lines[6] !== "network=kaspa"
    || lines[7] !== "nominal_hashrate_ghs=4200"
    || !/^nonce=[1-9][0-9]*$/.test(lines[8] ?? "")
    || !/^expires_at_ns=[1-9][0-9]*$/.test(lines[9] ?? "")
  ) {
    throw new Error("Miner registration challenge is malformed or targets another Gateway or miner specification");
  }
}

export class GatewayIdentity {
  private readonly stored: StoredGatewayIdentity;
  private readonly publicKey: Uint8Array;

  private constructor(stored: StoredGatewayIdentity, publicKey: Uint8Array) {
    this.stored = stored;
    this.publicKey = publicKey;
  }

  static loadOrCreate(path: string): GatewayIdentity {
    if (existsSync(path)) {
      const stored = JSON.parse(readFileSync(path, "utf8")) as StoredGatewayIdentity;
      if (stored.version !== 1 || !/^gateway-[a-f0-9]{16}$/.test(stored.gatewayId)) {
        throw new Error("Stored Gateway identity is invalid");
      }
      createPrivateKey(stored.privateKeyPem);
      chmodSync(path, 0o600);
      return new GatewayIdentity(stored, publicKeyBytes(stored.privateKeyPem));
    }

    mkdirSync(dirname(path), { recursive: true });
    const { privateKey } = generateKeyPairSync("ed25519");
    const stored: StoredGatewayIdentity = {
      version: 1,
      gatewayId: `gateway-${randomBytes(8).toString("hex")}`,
      privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    };
    const temporaryPath = `${path}.new`;
    writeFileSync(temporaryPath, `${JSON.stringify(stored)}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(temporaryPath, path);
    chmodSync(path, 0o600);
    return new GatewayIdentity(stored, publicKeyBytes(stored.privateKeyPem));
  }

  view(): GatewayIdentityView {
    return {
      gatewayId: this.stored.gatewayId,
      publicKeyBase64: Buffer.from(this.publicKey).toString("base64"),
    };
  }

  signPairingChallenge(challenge: string): string {
    validatePairingChallenge(challenge, this.stored.gatewayId);
    const signature = sign(null, Buffer.from(challenge, "utf8"), this.stored.privateKeyPem);
    return signature.toString("base64");
  }

  signMinerRegistrationChallenge(challenge: string): string {
    validateMinerRegistrationChallenge(challenge, this.stored.gatewayId);
    const signature = sign(null, Buffer.from(challenge, "utf8"), this.stored.privateKeyPem);
    return signature.toString("base64");
  }
}
